// Implements: INT-08 / INT-09 over Fusion REST `invoices` (11.13.18.05), checked against the
// test pod's /describe on 24 Oct 2026: create needs Supplier (name) + SupplierSite (SupplierNumber
// is read-only), PaymentMethodCode, PaymentTerms; each line needs an AccountingDate; invoices can
// be searched by InvoiceNumber + SupplierNumber. Basic auth; the password never reaches a log.
import { FusionError, type FusionResponse } from '../client';
import type { FusionInvoice, FusionInvoicePayload } from '../invoices';

export interface RestConnection {
  baseUrl: string;
  user: string;
  password: string;
  restVersion: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const STATUS_FIELDS =
  'InvoiceId,InvoiceNumber,SupplierNumber,InvoiceAmount,ValidationStatus,ApprovalStatus,PaidStatus,CanceledFlag,AmountPaid';

const q = (s: string) => s.replace(/'/g, "''");

async function rest(
  conn: RestConnection,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown; text: string }> {
  const url = `${conn.baseUrl.replace(/\/+$/, '')}/fscmRestApi/resources/${conn.restVersion}/${path}`;
  let res: Response;
  try {
    res = await (conn.fetch ?? fetch)(url, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${conn.user}:${conn.password}`).toString('base64')}`,
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(conn.timeoutMs ?? 120_000),
    });
  } catch (err) {
    throw new FusionError(`${method} ${path.split('?')[0]}: ${(err as Error).message}`, null, true);
  }
  const text = await res.text();
  if (!res.ok) {
    // Fusion returns the validation message as plain text (e.g. "The supplier site is not valid").
    const message = text.replace(/\s+/g, ' ').trim().slice(0, 500) || `HTTP ${res.status}`;
    throw FusionError.fromStatus(res.status, message);
  }
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function toInvoice(raw: Record<string, unknown>): FusionInvoice {
  return {
    InvoiceId: Number(raw.InvoiceId),
    InvoiceNumber: String(raw.InvoiceNumber ?? ''),
    SupplierNumber: String(raw.SupplierNumber ?? ''),
    InvoiceAmount: Number(raw.InvoiceAmount ?? 0),
    ValidationStatus: String(raw.ValidationStatus ?? ''),
    ApprovalStatus: String(raw.ApprovalStatus ?? ''),
    PaidStatus: (raw.PaidStatus as FusionInvoice['PaidStatus']) ?? 'Unpaid',
    CanceledFlag: raw.CanceledFlag === true || raw.CanceledFlag === 'Y',
    AmountPaid: Number(raw.AmountPaid ?? 0),
  };
}

/** The POST body: only attributes Fusion accepts on create (SupplierNumber is read-only there). */
export function createBody(payload: FusionInvoicePayload): Record<string, unknown> {
  const {
    SupplierNumber: _readOnly,
    PaymentCurrency: _sameAsInvoice,
    invoiceDff,
    invoiceLines,
    ...header
  } = payload;
  return {
    ...header,
    // D-57: the company's invoice flexfield (a child collection of one row).
    ...(invoiceDff && { invoiceDff: [invoiceDff] }),
    invoiceLines: invoiceLines.map((line) => ({
      ...line,
      AccountingDate: payload.InvoiceDate,
    })),
  };
}

export async function findInvoices(
  conn: RestConnection,
  invoiceNumber: string,
  supplierNumber: string,
): Promise<FusionResponse<FusionInvoice[]>> {
  const filter = `InvoiceNumber='${q(invoiceNumber)}';SupplierNumber='${q(supplierNumber)}'`;
  const res = await rest(
    conn,
    'GET',
    `invoices?q=${encodeURIComponent(filter)}&onlyData=true&fields=${STATUS_FIELDS}`,
  );
  const items = ((res.json as { items?: Record<string, unknown>[] })?.items ?? []).map(toInvoice);
  return { body: items, httpStatus: res.status, raw: `${items.length} invoices` };
}

export async function createInvoice(
  conn: RestConnection,
  payload: FusionInvoicePayload,
): Promise<FusionResponse<FusionInvoice>> {
  const res = await rest(conn, 'POST', 'invoices', createBody(payload));
  const invoice = toInvoice(res.json as Record<string, unknown>);
  if (!invoice.InvoiceId) throw new FusionError('Fusion created no InvoiceId', res.status, false);
  return { body: invoice, httpStatus: res.status, raw: `InvoiceId ${invoice.InvoiceId}` };
}

export async function getInvoice(
  conn: RestConnection,
  invoiceId: number,
): Promise<FusionResponse<FusionInvoice>> {
  const res = await rest(
    conn,
    'GET',
    `invoices/${invoiceId}?onlyData=true&fields=${STATUS_FIELDS}`,
  );
  const invoice = toInvoice(res.json as Record<string, unknown>);
  return { body: invoice, httpStatus: res.status, raw: `${invoice.PaidStatus}` };
}

export async function addInvoiceAttachment(
  conn: RestConnection,
  invoiceId: number,
  file: { fileName: string; title: string; contentBase64: string },
): Promise<FusionResponse<unknown>> {
  const res = await rest(conn, 'POST', `invoices/${invoiceId}/child/attachments`, {
    DatatypeCode: 'FILE',
    Category: 'From Supplier',
    FileName: file.fileName,
    Title: file.title,
    FileContents: file.contentBase64,
  });
  return { body: null, httpStatus: res.status, raw: `attached ${file.fileName}` };
}
