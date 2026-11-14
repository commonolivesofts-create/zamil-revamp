import { describe, expect, it } from 'vitest';
import { FusionError } from '../client';
import { parseRunReportResponse, runBipReport, runReportEnvelope, soapFault } from './bip';

const csv =
  'INVOICE_ID,PAYMENT_NUMBER,PAYMENT_DATE,AMOUNT,STATUS\n300000050001,PAY-1,2026-10-01,2400.00,NEGOTIABLE\n';
const ok = (text: string) =>
  `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Body>` +
  `<ns2:runReportResponse xmlns:ns2="http://xmlns.oracle.com/oxp/service/PublicReportService">` +
  `<ns2:runReportReturn><ns2:reportBytes>${Buffer.from(text).toString('base64')}</ns2:reportBytes>` +
  `<ns2:reportContentType>text/plain</ns2:reportContentType></ns2:runReportReturn>` +
  `</ns2:runReportResponse></env:Body></env:Envelope>`;
const fault = (text: string) =>
  `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Body><env:Fault>` +
  `<env:Code><env:Value>env:Receiver</env:Value></env:Code>` +
  `<env:Reason><env:Text xml:lang="en">${text}</env:Text></env:Reason></env:Fault></env:Body></env:Envelope>`;

function fakeFetch(status: number, body: string) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const conn = (f: typeof fetch) => ({
  baseUrl: 'https://pod.example.test/',
  user: 'INT_USER',
  password: 'p@ss<word>',
  pathPrefix: '/Custom/ExpenseHub',
  fetch: f,
});

describe('BIP runReport (INTEGRATION §3)', () => {
  it('builds the SOAP request: report path, CSV, escaped parameters, blanks left out', () => {
    const env = runReportEnvelope('/Custom/ExpenseHub/EH_PAY_QUICK_PAYS.xdo', {
      P_ELEMENTS: 'Travel & Allowance,<x>',
      P_FROM_DATE: '2026-07-21',
      P_EMPTY: '',
    });
    expect(env).toContain('<pub:reportAbsolutePath>/Custom/ExpenseHub/EH_PAY_QUICK_PAYS.xdo<');
    expect(env).toContain('<pub:attributeFormat>xml</pub:attributeFormat>');
    expect(env).toContain('<pub:item>Travel &amp; Allowance,&lt;x&gt;</pub:item>');
    expect(env).toContain('<pub:name>P_FROM_DATE</pub:name>');
    expect(env).not.toContain('P_EMPTY');
  });

  it('decodes reportBytes into rows keyed by the CSV header', () => {
    expect(parseRunReportResponse(ok(csv))).toEqual([
      {
        INVOICE_ID: '300000050001',
        PAYMENT_NUMBER: 'PAY-1',
        PAYMENT_DATE: '2026-10-01',
        AMOUNT: '2400.00',
        STATUS: 'NEGOTIABLE',
      },
    ]);
    expect(parseRunReportResponse(ok(''))).toEqual([]);
    expect(parseRunReportResponse(ok('﻿A,B\n1,2\n'))).toEqual([{ A: '1', B: '2' }]);
  });

  it('decodes BIP data XML (layout-less reports) into rows, keeping empty columns', () => {
    const data =
      '<?xml version="1.0" encoding="UTF-8"?>\n<DATA_DS>\n<G_1>\n<PERSON_ID>300000010011</PERSON_ID>\n' +
      '<FULL_NAME>Ahmed &amp; Co &lt;IPP&gt; &#1593;</FULL_NAME>\n<EMAIL/>\n</G_1>\n' +
      '<G_1><PERSON_ID>2</PERSON_ID><FULL_NAME><![CDATA[B <x>]]></FULL_NAME><EMAIL>b@x.test</EMAIL></G_1>\n</DATA_DS>';
    expect(parseRunReportResponse(ok(data))).toEqual([
      { PERSON_ID: '300000010011', FULL_NAME: 'Ahmed & Co <IPP> ع', EMAIL: '' },
      { PERSON_ID: '2', FULL_NAME: 'B <x>', EMAIL: 'b@x.test' },
    ]);
    expect(parseRunReportResponse(ok('<?xml version="1.0"?><DATA_DS></DATA_DS>'))).toEqual([]);
    // Empty result as Fusion sends it: parameters + an empty ROWSET under the root.
    expect(
      parseRunReportResponse(ok('<DATA_DS><P_INVOICE_IDS>0</P_INVOICE_IDS><ROWSET/></DATA_DS>')),
    ).toEqual([]);
    // Rows nested in a list wrapper (DATA_DS > LIST_G_1 > G_1).
    expect(
      parseRunReportResponse(
        ok('<DATA_DS><LIST_G_1><G_1><A>1</A></G_1><G_1><A>2</A></G_1></LIST_G_1></DATA_DS>'),
      ),
    ).toEqual([{ A: '1' }, { A: '2' }]);
  });

  it('posts to ExternalReportWSSService with basic auth and returns the rows', async () => {
    const f = fakeFetch(200, ok(csv));
    const res = await runBipReport(conn(f.fn), 'EH_AP_INVOICE_PAYMENTS', { P_INVOICE_IDS: '1,2' });
    expect(res.body).toHaveLength(1);
    expect(res.raw).toBe('1 rows'); // the integration log gets a count, not personal data
    expect(f.calls[0]!.url).toBe(
      'https://pod.example.test/xmlpserver/services/ExternalReportWSSService',
    );
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('INT_USER:p@ss<word>').toString('base64')}`,
    );
    expect(headers['Content-Type']).toContain('application/soap+xml');
  });

  it('a SOAP fault is not retried and never echoes the password', async () => {
    const f = fakeFetch(
      500,
      fault(
        'oracle.xdo.webservice.exception.AccessDeniedException: PublicReportService::executeReport Failure: no access to /Custom/ExpenseHub/EH_HCM_EMPLOYEES.xdo',
      ),
    );
    const err = await runBipReport(conn(f.fn), 'EH_HCM_EMPLOYEES', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FusionError);
    expect(err).toMatchObject({ httpStatus: 500, retryable: false });
    expect((err as Error).message).toContain('AccessDeniedException');
    expect((err as Error).message).not.toContain('p@ss');
  });

  it('401 explains the likely cause; 503 without a fault and network errors are retryable', async () => {
    await expect(
      runBipReport(conn(fakeFetch(401, '').fn), 'EH_HCM_EMPLOYEES', {}),
    ).rejects.toMatchObject({
      httpStatus: 401,
      retryable: false,
      message: expect.stringContaining('integration user'),
    });
    await expect(
      runBipReport(conn(fakeFetch(503, 'down').fn), 'EH_HCM_EMPLOYEES', {}),
    ).rejects.toMatchObject({
      retryable: true,
    });
    const broken = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(runBipReport(conn(broken), 'EH_HCM_EMPLOYEES', {})).rejects.toMatchObject({
      httpStatus: null,
      retryable: true,
    });
  });

  it('reads the fault text of SOAP 1.1 too', () => {
    expect(
      soapFault('<S:Fault><faultcode>x</faultcode><faultstring>Bad SQL</faultstring></S:Fault>'),
    ).toBe('Bad SQL');
    expect(soapFault(ok(csv))).toBeNull();
  });
});
