// Service-layer integrity (D-33): the rules the DB triggers will enforce from M8 already hold.
import { parseSar, type ReportStatus } from '@expensehub/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { SYSTEM, basics, expense, report } from '../data/contract/builders';
import { MemoryDataLayer } from '../data/memory/store';
import {
  adjustLineAmount,
  assertAdvanceActor,
  assertLineEditable,
  decideStep,
  recordAuditOutcome,
  transitionReport,
} from './integrity';

let data: MemoryDataLayer;
let ids: { claimant: number; approver: number; reportId: number; stepId: number; lineId: number };

async function setReportStatus(status: ReportStatus) {
  await data.withTransaction((r) => r.reports.update(ids.reportId, { status }, SYSTEM));
}

beforeEach(async () => {
  data = new MemoryDataLayer();
  ids = await data.withTransaction(async (r) => {
    const { claimant, approver, typeId } = await basics(r);
    const rep = await r.reports.insert(report(claimant), SYSTEM);
    const line = await r.expenses.insert(
      expense(claimant, typeId, '500.00', { reportId: rep.reportId, lineNo: 1 }),
      SYSTEM,
    );
    const step = await r.approvalSteps.insert(
      {
        reportId: rep.reportId,
        seq: 1,
        stepName: 'Line Manager',
        ruleId: null,
        isAuditStep: 'N',
        assignedTo: approver,
        originalAssignee: null,
        status: 'PENDING',
        actedBy: null,
        actedAt: null,
        commentText: null,
        pendingSince: null,
        remindedAt: null,
        escalatedAt: null,
        cycleNo: 1,
      },
      SYSTEM,
    );
    return {
      claimant,
      approver,
      reportId: rep.reportId,
      stepId: step.stepId,
      lineId: line.expenseId,
    };
  });
});

const history = () => data.read((r) => r.reportHistory.listFor('REPORT', ids.reportId));

describe('report status transitions (TRD §4.3)', () => {
  it('moves along an allowed path and writes one history row per move', async () => {
    await data.withTransaction((r) =>
      transitionReport(r, ids.reportId, 'PENDING_APPROVAL', ids.claimant, { action: 'SUBMITTED' }),
    );
    const rows = await history();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'SUBMITTED',
      fromStatus: 'DRAFT',
      toStatus: 'PENDING_APPROVAL',
      actorId: ids.claimant,
    });
    expect((await data.read((r) => r.reports.get(ids.reportId)))?.status).toBe('PENDING_APPROVAL');
  });

  it('refuses an illegal jump and changes nothing', async () => {
    await expect(
      data.withTransaction((r) => transitionReport(r, ids.reportId, 'PAID', null)),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await data.read((r) => r.reports.get(ids.reportId)))?.status).toBe('DRAFT');
    expect(await history()).toHaveLength(0);
  });

  it('rolls the history row back with a failed transaction', async () => {
    await expect(
      data.withTransaction(async (r) => {
        await transitionReport(r, ids.reportId, 'PENDING_APPROVAL', ids.claimant);
        throw new Error('later step failed');
      }),
    ).rejects.toThrow();
    expect(await history()).toHaveLength(0);
  });
});

describe('DB-01 — no self-approval', () => {
  it('rejects the claimant deciding their own step', async () => {
    await expect(
      data.withTransaction((r) => decideStep(r, ids.stepId, 'APPROVED', ids.claimant, null)),
    ).rejects.toMatchObject({ code: 'SOD_VIOLATION', details: { rule: 'DB-01' } });
    const step = await data.read((r) => r.approvalSteps.get(ids.stepId));
    expect(step?.status).toBe('PENDING');
  });

  it('lets another person approve and records it in history', async () => {
    const step = await data.withTransaction((r) =>
      decideStep(r, ids.stepId, 'APPROVED', ids.approver, null),
    );
    expect(step).toMatchObject({ status: 'APPROVED', actedBy: ids.approver });
    expect((await history()).map((h) => h.action)).toEqual(['STEP_APPROVED']);
  });

  it('requires a reason to reject (FR-APR-04)', async () => {
    await expect(
      data.withTransaction((r) => decideStep(r, ids.stepId, 'REJECTED', ids.approver, '  ')),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('cannot decide a step twice', async () => {
    await data.withTransaction((r) => decideStep(r, ids.stepId, 'APPROVED', ids.approver, null));
    await expect(
      data.withTransaction((r) =>
        decideStep(r, ids.stepId, 'REJECTED', ids.approver, 'changed my mind'),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('DB-02 — no self-audit', () => {
  it('rejects the claimant as auditor', async () => {
    await expect(
      data.withTransaction((r) =>
        recordAuditOutcome(r, ids.reportId, ids.claimant, 'RELEASED', null),
      ),
    ).rejects.toMatchObject({ code: 'SOD_VIOLATION', details: { rule: 'DB-02' } });
  });

  it('records an audit outcome by someone else', async () => {
    const audit = await data.withTransaction((r) =>
      recordAuditOutcome(r, ids.reportId, ids.approver, 'RELEASED', null),
    );
    expect(audit).toMatchObject({ auditorId: ids.approver, outcome: 'RELEASED' });
  });
});

describe('DB-03 / DB-06 — line adjustments and locked lines', () => {
  it('rejects the claimant adjusting their own line', async () => {
    await setReportStatus('PENDING_AUDIT');
    await expect(
      data.withTransaction((r) =>
        adjustLineAmount(r, ids.lineId, parseSar('100'), 'no receipt', ids.claimant),
      ),
    ).rejects.toMatchObject({ code: 'SOD_VIOLATION', details: { rule: 'DB-03' } });
  });

  it('allows adjustments only during audit', async () => {
    await expect(
      data.withTransaction((r) =>
        adjustLineAmount(r, ids.lineId, parseSar('100'), 'no receipt', ids.approver),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('reduces a line, keeps the original amount and logs it (FR-AUD-04)', async () => {
    await setReportStatus('PENDING_AUDIT');
    const line = await data.withTransaction((r) =>
      adjustLineAmount(r, ids.lineId, parseSar('350.00'), 'Over hotel cap', ids.approver),
    );
    expect(line).toMatchObject({
      amountSar: parseSar('500.00'),
      approvedAmountSar: parseSar('350.00'),
      adjustmentReason: 'Over hotel cap',
    });
    const rows = await data.read((r) => r.reportHistory.listFor('EXPENSE', ids.lineId));
    expect(rows[0]?.action).toBe('LINE_ADJUSTED');
  });

  it('never raises a line above the claimed amount', async () => {
    await setReportStatus('PENDING_AUDIT');
    await expect(
      data.withTransaction((r) =>
        adjustLineAmount(r, ids.lineId, parseSar('600'), 'typo', ids.approver),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('locks amount, type and date once the report leaves DRAFT', () => {
    expect(() => assertLineEditable('DRAFT', ['amountSar'])).not.toThrow();
    expect(() => assertLineEditable(null, ['amountSar'])).not.toThrow();
    expect(() =>
      assertLineEditable('PENDING_APPROVAL', ['justification', 'attendees']),
    ).not.toThrow(); // OQ-06
    expect(() => assertLineEditable('PENDING_APPROVAL', ['amountSar'])).toThrow(/withdraw/);
    expect(() => assertLineEditable('READY_FOR_PAYMENT', ['expenseDate'])).toThrow();
  });
});

describe('DB-04 — advances', () => {
  it('rejects the owner approving or paying out their own advance', () => {
    const advance = { personId: 7 } as Parameters<typeof assertAdvanceActor>[0];
    expect(() => assertAdvanceActor(advance, 7)).toThrow(/own advance/);
    expect(() => assertAdvanceActor(advance, 8)).not.toThrow();
  });
});
