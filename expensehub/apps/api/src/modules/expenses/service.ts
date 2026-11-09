// Implements: FR-CAP-01…10, FR-POL-02/03 — the policy engine is authoritative on save: any BLOCK
// refuses the save (422 POLICY_BLOCK); WARN results are stored as violations (DRD: replaced on each
// validation while the line is editable).
import { parseSar, type ExpenseInput, type ExpenseUpdate } from '@expensehub/shared';
import type { ExpenseRow, PersonId } from '../../data/entities';
import type { DataLayer, NewExpense, Repos } from '../../data/ports';
import { assertLineEditable } from '../../domain/integrity';
import { riyadhDate, type Clock } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import type { ReceiptFiles } from '../../receipts/files';
import { recalcTotals } from '../reports/workflow';
import { evaluateExpense, type Evaluated } from './context';
import { editMode } from './dto';

export class ExpenseService {
  constructor(private readonly deps: { data: DataLayer; clock: Clock; files: ReceiptFiles }) {}

  private today(): string {
    return riyadhDate(this.deps.clock());
  }

  validate(personId: PersonId, input: ExpenseInput, expenseId?: number | null): Promise<Evaluated> {
    return this.deps.data.read((r) =>
      evaluateExpense(r, personId, input, { today: this.today(), expenseId }),
    );
  }

  private assertNoBlock(e: Evaluated): void {
    if (e.output.level === 'BLOCK') {
      throw new AppError('POLICY_BLOCK', 'Fix the items marked as blocking before saving.', {
        results: e.output.results.filter((r) => r.level === 'BLOCK'),
      });
    }
  }

  /** The persisted columns derived from the input and its evaluation. */
  private fields(
    input: ExpenseInput,
    e: Evaluated,
  ): Omit<NewExpense, 'personId' | 'reportId' | 'lineNo'> {
    const o = e.output;
    const amountSar = o.amountSar!;
    const standard = e.type.category === 'STANDARD';
    return {
      expenseDate: input.expenseDate,
      typeId: e.type.typeId,
      merchant: input.merchant ?? null,
      description: input.description ?? null,
      attendees: input.attendees ?? null,
      justification: input.justification ?? null,
      quantity: o.quantity === null ? null : Number(o.quantity),
      unitRateSar: o.unitRateSar,
      // Mileage / per diem: the calculated SAR amount is the claimed amount (FR-CAP-05).
      // STANDARD always has an amount here: a missing one is a BLOCK (DETAILS rule).
      amount: standard ? parseSar(input.amount!) : amountSar,
      currency: standard ? input.currency : 'SAR',
      fxRate: o.fxRate ?? '1.00000000',
      fxRateDate: o.fxRateDate,
      amountSar,
      vatSar: o.vatSar,
      netSar: o.netSar!,
      approvedAmountSar: amountSar,
      adjustmentReason: null,
      taxInvoice: input.taxInvoice ? 'Y' : 'N',
      receiptRequired: o.receiptRequired ? 'Y' : 'N',
      receiptAttached: e.receipt ? 'Y' : 'N',
      chargeAccount: e.chargeAccount!,
      costCenter: input.costCenter || null,
      tripId: input.tripId ?? null,
      quickPayId: input.quickPayId ?? null,
      source: 'CASH',
      cardTxnId: null,
      receiptHash: e.receipt?.sha256 ?? null,
      policyLevel: o.level,
    };
  }

  private async saveViolations(r: Repos, expenseId: number, e: Evaluated) {
    await r.policyViolations.replaceForExpense(
      expenseId,
      e.output.results
        .filter((x) => x.level !== 'PASS')
        .map((x) => ({ ruleCode: x.rule, level: x.level as 'WARN' | 'BLOCK', message: x.message })),
    );
  }

  private async linkReceipt(
    r: Repos,
    expense: ExpenseRow,
    receiptId: number | null,
    actorId: PersonId,
  ) {
    for (const old of await r.receipts.listByExpense(expense.expenseId)) {
      if (old.receiptId !== receiptId) {
        await r.receipts.update(old.receiptId, { expenseId: null }, { actorId });
      }
    }
    if (receiptId) {
      const receipt = await r.receipts.getOrThrow(receiptId);
      if (receipt.expenseId !== expense.expenseId) {
        await r.receipts.update(
          receiptId,
          { expenseId: expense.expenseId },
          { actorId, expectedVersion: receipt.version },
        );
      }
    }
  }

  create(personId: PersonId, input: ExpenseInput) {
    return this.deps.data.withTransaction(async (r) => {
      const e = await evaluateExpense(r, personId, input, { today: this.today() });
      this.assertNoBlock(e);
      const row = await r.expenses.insert(
        { personId, reportId: null, lineNo: null, ...this.fields(input, e) },
        { actorId: personId },
      );
      await this.saveViolations(r, row.expenseId, e);
      await this.linkReceipt(r, row, input.receiptId ?? null, personId);
      await r.reportHistory.append({
        entityType: 'EXPENSE',
        entityId: row.expenseId,
        actorId: personId,
        action: 'CREATED',
        fromStatus: null,
        toStatus: null,
        detail: { policyLevel: row.policyLevel },
      });
      return row;
    });
  }

  /** Own expense or NOT_FOUND (others' expenses are not revealed). */
  private async own(r: Repos, personId: PersonId, expenseId: number): Promise<ExpenseRow> {
    const row = await r.expenses.get(expenseId);
    if (!row || row.personId !== personId) throw new AppError('NOT_FOUND', 'Expense not found');
    return row;
  }

  update(personId: PersonId, expenseId: number, input: ExpenseUpdate) {
    return this.deps.data.withTransaction(async (r) => {
      const current = await this.own(r, personId, expenseId);
      const report = current.reportId ? await r.reports.getOrThrow(current.reportId) : null;
      const mode = editMode(report ?? undefined);
      if (mode === 'NONE') {
        throw new AppError(
          'INVALID_STATE',
          'This expense is on a submitted report and cannot be changed.',
          { status: report?.status },
        );
      }
      // LIMITED (info requested, OQ-06): DB-06 below refuses amount / type / date changes.
      const reportStatus = report?.status ?? null;
      const e = await evaluateExpense(r, personId, input, { today: this.today(), expenseId });
      this.assertNoBlock(e);
      const next = this.fields(input, e);
      // DB-06: amount / type / date are locked once the report has left DRAFT.
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
        (k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]),
      );
      assertLineEditable(reportStatus, changed);
      const row = await r.expenses.update(expenseId, next, {
        actorId: personId,
        expectedVersion: input.version,
      });
      await this.saveViolations(r, expenseId, e);
      await this.linkReceipt(r, row, input.receiptId ?? null, personId);
      await r.reportHistory.append({
        entityType: 'EXPENSE',
        entityId: expenseId,
        actorId: personId,
        action: 'UPDATED',
        fromStatus: null,
        toStatus: null,
        detail: { fields: changed },
      });
      if (row.reportId !== null) await recalcTotals(r, row.reportId, personId);
      return row;
    });
  }

  /** FR-CAP-09: only unreported expenses; the receipt file moves to _deleted/ (TRD §9). */
  async delete(personId: PersonId, expenseId: number): Promise<void> {
    const moved = await this.deps.data.withTransaction(async (r) => {
      const row = await this.own(r, personId, expenseId);
      if (row.reportId !== null) {
        throw new AppError(
          'INVALID_STATE',
          'This expense is on a report. Remove it from the report first.',
        );
      }
      const receipts = await r.receipts.listByExpense(expenseId);
      for (const receipt of receipts) await r.receipts.delete(receipt.receiptId);
      await r.policyViolations.replaceForExpense(expenseId, []);
      await r.expenses.delete(expenseId);
      await r.reportHistory.append({
        entityType: 'EXPENSE',
        entityId: expenseId,
        actorId: personId,
        action: 'DELETED',
        fromStatus: null,
        toStatus: null,
        detail: { amountSar: row.amountSar, receipts: receipts.map((x) => x.receiptId) },
      });
      return receipts.map((x) => x.filePath);
    });
    for (const filePath of moved)
      await this.deps.files.moveToDeleted(filePath).catch(() => undefined);
  }

  get(personId: PersonId, expenseId: number) {
    return this.deps.data.read((r) => this.own(r, personId, expenseId));
  }
}
