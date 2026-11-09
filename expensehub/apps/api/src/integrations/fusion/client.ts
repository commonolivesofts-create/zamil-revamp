// Implements: TRD §8 Fusion adapter — the transport. FUSION_MODE=mock (D-33) serves fixtures;
// the live client (REST + SOAP BIP) arrives in M8 and must keep this interface.
import type { FusionMode } from '@expensehub/shared';
import type { FusionInvoice, FusionInvoicePayload } from './invoices';
import { glDailyRateCsv, parseRows } from './contracts';
import { runBipReport as runBip } from './live/bip';
import * as livePayables from './live/payables';

/** INTEGRATION §1 BIP reports (catalog /Custom/ExpenseHub). */
export const BIP_REPORTS = [
  'EH_HCM_EMPLOYEES',
  'EH_AP_EMPLOYEE_PAYEES',
  'EH_GL_SEGMENT_VALUES',
  'EH_HCM_BUSINESS_TRIPS',
  'EH_PAY_QUICK_PAYS',
  'EH_AP_INVOICE_PAYMENTS',
  'EH_GL_DAILY_RATES',
] as const;
export type BipReport = (typeof BIP_REPORTS)[number];

export interface FusionResponse<T> {
  body: T;
  httpStatus: number;
  /** Raw payload for the integration log (truncated there). */
  raw: string;
}

/** A failed Fusion call. retryable = network error, 429 or 5xx (INTEGRATION §2.4). */
export class FusionError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'FusionError';
  }

  static fromStatus(httpStatus: number, message: string): FusionError {
    return new FusionError(message, httpStatus, httpStatus === 429 || httpStatus >= 500);
  }
}

export interface CurrencyRatesQuery {
  toCurrency: string;
  rateType: string;
  since: string;
}

export interface FusionClient {
  readonly mode: FusionMode;
  /** Runs a BIP report (SOAP runReport, CSV output) and returns its rows keyed by header. */
  runBipReport(
    report: BipReport,
    params: Record<string, string>,
  ): Promise<FusionResponse<Record<string, string>[]>>;
  /** REST GET currencyRates (INT-06). */
  getCurrencyRates(query: CurrencyRatesQuery): Promise<FusionResponse<unknown>>;
  /** INT-08 step 1 — idempotency: GET invoices?q=InvoiceNumber=…;Supplier=… */
  findInvoices(
    invoiceNumber: string,
    supplierNumber: string,
  ): Promise<FusionResponse<FusionInvoice[]>>;
  /** INT-08 step 2 — POST invoices. */
  createInvoice(payload: FusionInvoicePayload): Promise<FusionResponse<FusionInvoice>>;
  /** INT-08 step 4 — POST invoices/{id}/child/attachments (OQ-17). */
  addInvoiceAttachment(
    invoiceId: number,
    file: { fileName: string; title: string; contentBase64: string },
  ): Promise<FusionResponse<unknown>>;
  /** INT-09 — GET invoices/{id}. */
  getInvoice(invoiceId: number): Promise<FusionResponse<FusionInvoice>>;
}

export interface LiveFusionOptions {
  baseUrl: string;
  user: string;
  password: string;
  bipPathPrefix: string;
  restVersion: string;
  fetch?: typeof fetch;
}

/**
 * FUSION_MODE=live — M8 (D-33). BIP reports and currency rates (read-only) are live; the
 * Payables invoice calls still fail loudly until they are built and checked in the test pod.
 */
export class LiveFusionClient implements FusionClient {
  readonly mode = 'live' as const;
  constructor(private readonly options: LiveFusionOptions) {}
  runBipReport = (report: BipReport, params: Record<string, string>) =>
    runBip(
      {
        baseUrl: this.options.baseUrl,
        user: this.options.user,
        password: this.options.password,
        pathPrefix: this.options.bipPathPrefix,
        fetch: this.options.fetch,
      },
      report,
      params,
    );
  /**
   * INT-06: the currencyRates REST resource in the pod cannot be filtered (23 Oct 2026), so
   * rates come from BIP EH_GL_DAILY_RATES, returned in the REST response shape the sync expects.
   */
  getCurrencyRates = async (query: CurrencyRatesQuery): Promise<FusionResponse<unknown>> => {
    const res = await this.runBipReport('EH_GL_DAILY_RATES', {
      P_TO_CURRENCY: query.toCurrency,
      P_RATE_TYPE: query.rateType,
      P_FROM_DATE: query.since,
    });
    const items = parseRows(glDailyRateCsv, res.body, 'EH_GL_DAILY_RATES').map((r) => ({
      FromCurrency: r.FROM_CURRENCY,
      ToCurrency: r.TO_CURRENCY,
      UserConversionType: r.RATE_TYPE,
      ConversionDate: r.RATE_DATE,
      ConversionRate: Number(r.RATE),
    }));
    return { body: { items, hasMore: false }, httpStatus: res.httpStatus, raw: res.raw };
  };
  private get rest() {
    return {
      baseUrl: this.options.baseUrl,
      user: this.options.user,
      password: this.options.password,
      restVersion: this.options.restVersion,
      fetch: this.options.fetch,
    };
  }
  findInvoices = (invoiceNumber: string, supplierNumber: string) =>
    livePayables.findInvoices(this.rest, invoiceNumber, supplierNumber);
  createInvoice = (payload: FusionInvoicePayload) => livePayables.createInvoice(this.rest, payload);
  addInvoiceAttachment = (
    invoiceId: number,
    file: { fileName: string; title: string; contentBase64: string },
  ) => livePayables.addInvoiceAttachment(this.rest, invoiceId, file);
  getInvoice = (invoiceId: number) => livePayables.getInvoice(this.rest, invoiceId);
}
