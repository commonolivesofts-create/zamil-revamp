// Implements: INTEGRATION §2 common rules — every Fusion call is retried (2.4) and written to
// EH_INTEGRATION_LOG (2.3) with secrets stripped and the response truncated to 32 KB (TRD §8).
// The log row is committed in its own transaction, so a failed sync still leaves its trace —
// call the gateway outside the sync's transaction.
import type { InterfaceCode } from '@expensehub/shared';
import type { AppConfig } from '../../config';
import type { DataLayer } from '../../data/ports';
import { withRetry } from '../../lib/retry';
import {
  FusionError,
  type BipReport,
  type CurrencyRatesQuery,
  type FusionClient,
  type FusionResponse,
} from './client';
import type { FusionInvoice, FusionInvoicePayload } from './invoices';

/** What an INT-08/09 call is about, for the integration log (ref_type / ref_id). */
export interface InvoiceRef {
  refType: 'REPORT' | 'QUICK_PAY';
  refId: string;
}

const RESPONSE_LOG_LIMIT = 32 * 1024;

export interface FusionGatewayOptions {
  client: FusionClient;
  data: DataLayer;
  config: Pick<AppConfig, 'fusion'>;
  retryDelaysMs: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

export class FusionGateway {
  constructor(private readonly options: FusionGatewayOptions) {}

  get mode() {
    return this.options.client.mode;
  }

  /** BIP report rows (CSV header → value). */
  bip(
    iface: InterfaceCode,
    report: BipReport,
    params: Record<string, string> = {},
  ): Promise<Record<string, string>[]> {
    const { fusion } = this.options.config;
    return this.call(
      iface,
      {
        method: 'POST',
        url: `${fusion.baseUrl ?? '(mock)'}/xmlpserver/services/ExternalReportWSSService`,
        request: {
          reportAbsolutePath: `${fusion.bipPathPrefix}/${report}.xdo`,
          format: 'csv',
          params,
        },
      },
      () => this.options.client.runBipReport(report, params),
    );
  }

  currencyRates(query: CurrencyRatesQuery): Promise<unknown> {
    const { fusion } = this.options.config;
    return this.call(
      'INT-06',
      {
        method: 'GET',
        url: `${fusion.baseUrl ?? '(mock)'}/fscmRestApi/resources/${fusion.restVersion}/currencyRates`,
        request: query,
      },
      () => this.options.client.getCurrencyRates(query),
    );
  }

  private rest(path: string): string {
    const { fusion } = this.options.config;
    return `${fusion.baseUrl ?? '(mock)'}/fscmRestApi/resources/${fusion.restVersion}/${path}`;
  }

  /** INT-08 step 1 (idempotency): invoices with this number for this supplier. */
  findInvoices(
    invoiceNumber: string,
    supplierNumber: string,
    ref: InvoiceRef,
  ): Promise<FusionInvoice[]> {
    return this.call(
      'INT-08',
      {
        method: 'GET',
        url: this.rest(
          `invoices?q=InvoiceNumber='${invoiceNumber}';Supplier='${supplierNumber}'&onlyData=true`,
        ),
        request: null,
        direction: 'OUT',
        ...ref,
      },
      () => this.options.client.findInvoices(invoiceNumber, supplierNumber),
    );
  }

  /** INT-08 step 2. */
  createInvoice(payload: FusionInvoicePayload, ref: InvoiceRef): Promise<FusionInvoice> {
    return this.call(
      'INT-08',
      { method: 'POST', url: this.rest('invoices'), request: payload, direction: 'OUT', ...ref },
      () => this.options.client.createInvoice(payload),
    );
  }

  /** INT-08 step 4 (OQ-17). The file content is never logged. */
  addInvoiceAttachment(
    invoiceId: number,
    file: { fileName: string; title: string; contentBase64: string },
    ref: InvoiceRef,
  ): Promise<unknown> {
    return this.call(
      'INT-08',
      {
        method: 'POST',
        url: this.rest(`invoices/${invoiceId}/child/attachments`),
        request: {
          DatatypeCode: 'FILE',
          FileName: file.fileName,
          Title: file.title,
          FileContents: '(omitted)',
        },
        direction: 'OUT',
        ...ref,
      },
      () => this.options.client.addInvoiceAttachment(invoiceId, file),
    );
  }

  /** INT-09. */
  getInvoice(invoiceId: number, ref: InvoiceRef): Promise<FusionInvoice> {
    return this.call(
      'INT-09',
      {
        method: 'GET',
        url: this.rest(
          `invoices/${invoiceId}?fields=InvoiceId,InvoiceNumber,ValidationStatus,ApprovalStatus,PaidStatus,CanceledFlag,AmountPaid&onlyData=true`,
        ),
        request: null,
        ...ref,
      },
      () => this.options.client.getInvoice(invoiceId),
    );
  }

  private async call<T>(
    iface: InterfaceCode,
    describe: {
      method: string;
      url: string;
      request: unknown;
      direction?: 'IN' | 'OUT';
      refType?: string;
      refId?: string;
    },
    fn: () => Promise<FusionResponse<T>>,
  ): Promise<T> {
    const started = Date.now();
    const outcome = await withRetry(fn, {
      delaysMs: this.options.retryDelaysMs,
      isRetryable: (err) => err instanceof FusionError && err.retryable,
      sleep: this.options.sleep,
    });
    const durationMs = Date.now() - started;

    await this.options.data.withTransaction((r) =>
      r.integrationLog.insert({
        interface: iface,
        direction: describe.direction ?? 'IN',
        refType: describe.refType ?? null,
        refId: describe.refId ?? null,
        httpMethod: describe.method,
        url: describe.url,
        request: describe.request,
        response: outcome.ok
          ? outcome.value.raw.slice(0, RESPONSE_LOG_LIMIT)
          : errorMessage(outcome.error).slice(0, RESPONSE_LOG_LIMIT),
        httpStatus: outcome.ok
          ? outcome.value.httpStatus
          : outcome.error instanceof FusionError
            ? outcome.error.httpStatus
            : null,
        status: outcome.ok ? 'OK' : 'ERROR',
        retries: outcome.retries,
        durationMs,
      }),
    );

    if (!outcome.ok) throw outcome.error;
    return outcome.value.body;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
