import { describe, expect, it } from 'vitest';
import { FusionError } from '../client';
import type { FusionInvoicePayload } from '../invoices';
import {
  addInvoiceAttachment,
  createBody,
  createInvoice,
  findInvoices,
  getInvoice,
} from './payables';

const PAYLOAD: FusionInvoicePayload = {
  InvoiceNumber: 'EH-IPP-2026-000001',
  InvoiceCurrency: 'SAR',
  PaymentCurrency: 'SAR',
  InvoiceAmount: 100,
  InvoiceDate: '2026-10-24',
  BusinessUnit: 'IPP BU',
  Supplier: 'ZAID SAYYED',
  SupplierNumber: '10035',
  SupplierSite: 'Main',
  InvoiceType: 'Standard',
  InvoiceSource: 'EXPENSEHUB',
  Description: 'Expense report EH-IPP-2026-000001 – Test',
  PaymentMethodCode: 'EFT',
  PayGroup: 'EMPLOYEES',
  PaymentTerms: 'Immediate',
  invoiceLines: [
    {
      LineNumber: 1,
      LineType: 'Item',
      LineAmount: 100,
      Description: 'Taxi',
      DistributionCombination: 'IPP.003.127.55202.000.0000000',
    },
  ],
};

function fake(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const conn = (f: typeof fetch) => ({
  baseUrl: 'https://pod.test/',
  user: 'U',
  password: 'P',
  restVersion: '11.13.18.05',
  fetch: f,
});
const ROW = {
  InvoiceId: 300000123,
  InvoiceNumber: 'EH-IPP-2026-000001',
  SupplierNumber: '10035',
  InvoiceAmount: 100,
  ValidationStatus: 'Not validated',
  ApprovalStatus: 'Not required',
  PaidStatus: 'Unpaid',
  CanceledFlag: false,
  AmountPaid: 0,
};

describe('Fusion REST invoices (INT-08/09, checked against the pod)', () => {
  it('creates with the attributes Fusion accepts: no SupplierNumber, a date on each line', async () => {
    const body = createBody(PAYLOAD);
    expect(body).not.toHaveProperty('SupplierNumber');
    expect(body).not.toHaveProperty('PaymentCurrency');
    expect(createBody({ ...PAYLOAD, invoiceDff: { rirNumber: 'EH-1' } }).invoiceDff).toEqual([
      { rirNumber: 'EH-1' },
    ]);
    expect(body).toMatchObject({
      Supplier: 'ZAID SAYYED',
      SupplierSite: 'Main',
      PaymentMethodCode: 'EFT',
    });
    expect((body.invoiceLines as { AccountingDate: string }[])[0]!.AccountingDate).toBe(
      '2026-10-24',
    );

    const f = fake(201, ROW);
    const res = await createInvoice(conn(f.fn), PAYLOAD);
    expect(res.body).toMatchObject({
      InvoiceId: 300000123,
      PaidStatus: 'Unpaid',
      CanceledFlag: false,
    });
    expect(f.calls[0]!.url).toBe('https://pod.test/fscmRestApi/resources/11.13.18.05/invoices');
    expect(f.calls[0]!.init.method).toBe('POST');
  });

  it('finds by invoice number + supplier number, escaping quotes', async () => {
    const f = fake(200, { items: [ROW] });
    const res = await findInvoices(conn(f.fn), "EH-1'X", '10035');
    expect(res.body).toHaveLength(1);
    expect(decodeURIComponent(f.calls[0]!.url)).toContain(
      "q=InvoiceNumber='EH-1''X';SupplierNumber='10035'",
    );
  });

  it('reads the status and attaches a receipt', async () => {
    const g = fake(200, { ...ROW, PaidStatus: 'Paid', AmountPaid: 100, CanceledFlag: 'N' });
    expect((await getInvoice(conn(g.fn), 300000123)).body).toMatchObject({
      PaidStatus: 'Paid',
      AmountPaid: 100,
    });
    const a = fake(201, {});
    await addInvoiceAttachment(conn(a.fn), 300000123, {
      fileName: 'r.png',
      title: 'Receipt',
      contentBase64: 'AAA=',
    });
    expect(a.calls[0]!.url).toContain('/invoices/300000123/child/attachments');
    expect(JSON.parse(a.calls[0]!.init.body as string)).toMatchObject({
      DatatypeCode: 'FILE',
      FileName: 'r.png',
    });
  });

  it("passes Fusion's validation message through; 400 is not retried", async () => {
    const err = await createInvoice(
      conn(fake(400, 'The supplier site is not valid.').fn),
      PAYLOAD,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FusionError);
    expect(err).toMatchObject({
      httpStatus: 400,
      retryable: false,
      message: 'The supplier site is not valid.',
    });
    await expect(createInvoice(conn(fake(503, '').fn), PAYLOAD)).rejects.toMatchObject({
      retryable: true,
    });
  });
});
