// FUSION_MODE=mock (D-33): inbound interfaces answer from the fixture files in this folder;
// Payables (INT-08/09) is a small stateful invoice store that behaves like Fusion — it rejects a
// duplicate invoice number or a missing supplier with HTTP 400, and its invoices are moved through
// validated / paid / cancelled / voided by the dev simulator panel (D-36). Tests can inject
// failures or replace a payload.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  FusionError,
  type BipReport,
  type CurrencyRatesQuery,
  type FusionClient,
  type FusionResponse,
} from '../client';
import type { FusionInvoice, FusionInvoicePayload } from '../invoices';

const MOCK_DIR = import.meta.dirname;

export type MockTarget =
  BipReport | 'currencyRates' | 'findInvoices' | 'createInvoice' | 'attachments' | 'getInvoice';

export interface MockPayment {
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  status: 'NEGOTIABLE' | 'VOIDED';
}

export interface MockInvoice extends FusionInvoice {
  Supplier: string;
  BusinessUnit: string;
  InvoiceDate: string;
  Description: string;
  lines: FusionInvoicePayload['invoiceLines'];
  attachments: string[];
  payments: MockPayment[];
  createdAt: string;
}

interface MockState {
  nextInvoiceId: number;
  nextPayment: number;
  autoAdvance: boolean;
  invoices: MockInvoice[];
}

export type SimulatorAction = 'validate' | 'pay' | 'cancel' | 'void';

const today = () => new Date().toISOString().slice(0, 10);

export class MockFusionClient implements FusionClient {
  readonly mode = 'mock' as const;
  private readonly failures = new Map<MockTarget, { httpStatus: number | null; times: number }>();
  private readonly overrides = new Map<MockTarget, string>();
  private state: MockState;
  /** Calls made, for tests. */
  readonly calls: { target: MockTarget; params: unknown }[] = [];

  /** `stateFile` keeps mock invoices across restarts (dev); omit for memory only (tests). */
  constructor(private readonly options: { stateFile?: string | null } = {}) {
    this.state = this.load();
  }

  /** The next `times` calls to target fail with httpStatus (null = network error). */
  failNext(target: MockTarget, httpStatus: number | null, times = 1): void {
    this.failures.set(target, { httpStatus, times });
  }

  /** Pending injected failures (simulator panel). */
  pendingFailures(): { target: MockTarget; httpStatus: number | null; times: number }[] {
    return [...this.failures]
      .filter(([, f]) => f.times > 0)
      .map(([target, f]) => ({ target, ...f }));
  }

  /** Replace a fixture: CSV text for a BIP report, JSON text for currencyRates. */
  override(target: MockTarget, raw: string): void {
    this.overrides.set(target, raw);
  }

  // ─── Inbound fixtures ─────────────────────────────────────────────────────

  async runBipReport(
    report: BipReport,
    params: Record<string, string>,
  ): Promise<FusionResponse<Record<string, string>[]>> {
    this.calls.push({ target: report, params });
    this.maybeFail(report);
    const raw =
      this.overrides.get(report) ??
      (report === 'EH_AP_INVOICE_PAYMENTS'
        ? this.paymentsCsv(params.P_INVOICE_IDS ?? '')
        : readFileSync(path.join(MOCK_DIR, `${report}.csv`), 'utf8'));
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
    return { body: rows, httpStatus: 200, raw };
  }

  async getCurrencyRates(query: CurrencyRatesQuery): Promise<FusionResponse<unknown>> {
    this.calls.push({ target: 'currencyRates', params: query });
    this.maybeFail('currencyRates');
    const raw =
      this.overrides.get('currencyRates') ??
      readFileSync(path.join(MOCK_DIR, 'currencyRates.json'), 'utf8');
    return { body: JSON.parse(raw) as unknown, httpStatus: 200, raw };
  }

  // ─── Payables (INT-08 / INT-09) ───────────────────────────────────────────

  async findInvoices(
    invoiceNumber: string,
    supplierNumber: string,
  ): Promise<FusionResponse<FusionInvoice[]>> {
    this.calls.push({ target: 'findInvoices', params: { invoiceNumber, supplierNumber } });
    this.maybeFail('findInvoices');
    const items = this.state.invoices
      .filter((i) => i.InvoiceNumber === invoiceNumber && i.SupplierNumber === supplierNumber)
      .map(publicView);
    return { body: items, httpStatus: 200, raw: JSON.stringify({ items, count: items.length }) };
  }

  async createInvoice(payload: FusionInvoicePayload): Promise<FusionResponse<FusionInvoice>> {
    this.calls.push({ target: 'createInvoice', params: payload });
    this.maybeFail('createInvoice');
    if (!payload.SupplierNumber) throw FusionError.fromStatus(400, 'Supplier is required.');
    if (
      this.state.invoices.some(
        (i) =>
          i.InvoiceNumber === payload.InvoiceNumber &&
          i.SupplierNumber === payload.SupplierNumber &&
          !i.CanceledFlag,
      )
    ) {
      throw FusionError.fromStatus(
        400,
        `Invoice number ${payload.InvoiceNumber} already exists for this supplier.`,
      );
    }
    const invoice: MockInvoice = {
      InvoiceId: this.state.nextInvoiceId++,
      InvoiceNumber: payload.InvoiceNumber,
      SupplierNumber: payload.SupplierNumber,
      Supplier: payload.Supplier,
      BusinessUnit: payload.BusinessUnit,
      InvoiceDate: payload.InvoiceDate,
      Description: payload.Description,
      InvoiceAmount: payload.InvoiceAmount,
      ValidationStatus: 'Not validated',
      ApprovalStatus: 'Not required',
      PaidStatus: 'Unpaid',
      CanceledFlag: false,
      AmountPaid: 0,
      lines: payload.invoiceLines,
      attachments: [],
      payments: [],
      createdAt: new Date().toISOString(),
    };
    this.state.invoices.push(invoice);
    this.save();
    return { body: publicView(invoice), httpStatus: 201, raw: JSON.stringify(publicView(invoice)) };
  }

  async addInvoiceAttachment(
    invoiceId: number,
    file: { fileName: string; title: string; contentBase64: string },
  ): Promise<FusionResponse<unknown>> {
    this.calls.push({ target: 'attachments', params: { invoiceId, fileName: file.fileName } });
    this.maybeFail('attachments');
    const invoice = this.find(invoiceId);
    invoice.attachments.push(file.fileName);
    this.save();
    const body = { AttachedDocumentId: invoice.attachments.length, FileName: file.fileName };
    return { body, httpStatus: 201, raw: JSON.stringify(body) };
  }

  async getInvoice(invoiceId: number): Promise<FusionResponse<FusionInvoice>> {
    this.calls.push({ target: 'getInvoice', params: { invoiceId } });
    this.maybeFail('getInvoice');
    const invoice = this.find(invoiceId);
    // D-36 auto-advance: each status poll moves an open invoice one step (validate → pay).
    if (this.state.autoAdvance && !invoice.CanceledFlag && invoice.PaidStatus !== 'Paid') {
      this.act(invoice.InvoiceId, invoice.ValidationStatus === 'Validated' ? 'pay' : 'validate');
    }
    return { body: publicView(invoice), httpStatus: 200, raw: JSON.stringify(publicView(invoice)) };
  }

  // ─── Dev simulator (D-36) ─────────────────────────────────────────────────

  listInvoices(): MockInvoice[] {
    return structuredClone(this.state.invoices).reverse();
  }

  get autoAdvance(): boolean {
    return this.state.autoAdvance;
  }

  setAutoAdvance(enabled: boolean): void {
    this.state.autoAdvance = enabled;
    this.save();
  }

  /** What Payables would do in Fusion: validate, pay (payment process request), cancel, void. */
  act(invoiceId: number, action: SimulatorAction): MockInvoice {
    const invoice = this.find(invoiceId);
    const fail = (message: string) => {
      throw FusionError.fromStatus(400, message);
    };
    switch (action) {
      case 'validate':
        if (invoice.CanceledFlag) fail('The invoice is cancelled.');
        invoice.ValidationStatus = 'Validated';
        break;
      case 'pay':
        if (invoice.CanceledFlag) fail('The invoice is cancelled.');
        if (invoice.PaidStatus === 'Paid') fail('The invoice is already paid.');
        invoice.ValidationStatus = 'Validated';
        invoice.PaidStatus = 'Paid';
        invoice.AmountPaid = invoice.InvoiceAmount;
        invoice.payments.push({
          paymentNumber: `PAY-${today().slice(0, 4)}-${String(this.state.nextPayment++).padStart(6, '0')}`,
          paymentDate: today(),
          amount: invoice.InvoiceAmount,
          status: 'NEGOTIABLE',
        });
        break;
      case 'cancel':
        if (invoice.PaidStatus !== 'Unpaid')
          fail('A paid invoice cannot be cancelled; void the payment first.');
        invoice.CanceledFlag = true;
        invoice.ValidationStatus = 'Cancelled';
        break;
      case 'void': {
        const live = invoice.payments.filter((p) => p.status !== 'VOIDED');
        if (live.length === 0) fail('The invoice has no payment to void.');
        for (const p of live) p.status = 'VOIDED';
        invoice.PaidStatus = 'Unpaid';
        invoice.AmountPaid = 0;
        break;
      }
    }
    this.save();
    return structuredClone(invoice);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private find(invoiceId: number): MockInvoice {
    const invoice = this.state.invoices.find((i) => i.InvoiceId === invoiceId);
    if (!invoice) throw FusionError.fromStatus(404, `Invoice ${invoiceId} not found.`);
    return invoice;
  }

  private paymentsCsv(invoiceIds: string): string {
    const wanted = new Set(invoiceIds.split(',').filter(Boolean).map(Number));
    const rows = this.state.invoices
      .filter((i) => wanted.has(i.InvoiceId))
      .flatMap((i) =>
        i.payments.map((p) =>
          [i.InvoiceId, p.paymentNumber, p.paymentDate, p.amount.toFixed(2), p.status].join(','),
        ),
      );
    return ['INVOICE_ID,PAYMENT_NUMBER,PAYMENT_DATE,AMOUNT,STATUS', ...rows].join('\n');
  }

  private load(): MockState {
    const file = this.options.stateFile;
    if (file && existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as MockState;
      } catch {
        // A corrupt dev state file starts over rather than blocking the API.
      }
    }
    return {
      nextInvoiceId: 300000060001,
      nextPayment: 1,
      autoAdvance: false,
      invoices: [SEEDED_PAID_INVOICE()],
    };
  }

  private save(): void {
    const file = this.options.stateFile;
    if (!file) return;
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, file);
  }

  private maybeFail(target: MockTarget): void {
    const failure = this.failures.get(target);
    if (!failure || failure.times <= 0) return;
    failure.times -= 1;
    if (failure.httpStatus === null) {
      throw new FusionError('Mock network error: connection reset', null, true);
    }
    throw FusionError.fromStatus(failure.httpStatus, `Mock HTTP ${failure.httpStatus} from Fusion`);
  }
}

/**
 * Fixture: the Quick Pay the dev seed shows as already paid (QP-IPP-2026-000001, Ahmed's
 * Business Trip Allowance) exists in mock Fusion too, so the INT-09 poll finds it.
 */
const SEEDED_PAID_INVOICE = (): MockInvoice => ({
  InvoiceId: 300000050001,
  InvoiceNumber: 'QP-IPP-2026-000001',
  SupplierNumber: '1011',
  Supplier: 'Ahmed Al-Subaie',
  BusinessUnit: 'IPP BU',
  InvoiceDate: '2026-09-21',
  Description: 'Business Trip Allowance (Quick Pay 2026-09-20)',
  InvoiceAmount: 2400,
  ValidationStatus: 'Validated',
  ApprovalStatus: 'Not required',
  PaidStatus: 'Paid',
  CanceledFlag: false,
  AmountPaid: 2400,
  lines: [],
  attachments: [],
  payments: [
    {
      paymentNumber: 'PAY-2026-004512',
      paymentDate: '2026-09-28',
      amount: 2400,
      status: 'NEGOTIABLE',
    },
  ],
  createdAt: '2026-09-21T08:00:00.000Z',
});

/** The fields INT-09 reads (INTEGRATION §6). */
function publicView(i: MockInvoice): FusionInvoice {
  return {
    InvoiceId: i.InvoiceId,
    InvoiceNumber: i.InvoiceNumber,
    SupplierNumber: i.SupplierNumber,
    InvoiceAmount: i.InvoiceAmount,
    ValidationStatus: i.ValidationStatus,
    ApprovalStatus: i.ApprovalStatus,
    PaidStatus: i.PaidStatus,
    CanceledFlag: i.CanceledFlag,
    AmountPaid: i.AmountPaid,
  };
}
