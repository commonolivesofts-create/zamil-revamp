import { REPORT_STATUSES } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import { REPORT_FILTERS, STATUS_TONE, stageOf } from './report-status';

describe('report status model', () => {
  it('gives every status a tone and a stage', () => {
    for (const status of REPORT_STATUSES) {
      expect(STATUS_TONE[status]).toBeDefined();
      expect(stageOf(status).done).toBeGreaterThanOrEqual(0);
    }
  });

  it('tracks the 5-step progress', () => {
    expect(stageOf('DRAFT')).toEqual({ done: 0, current: null, failed: false });
    expect(stageOf('PENDING_APPROVAL')).toEqual({ done: 1, current: 1, failed: false });
    expect(stageOf('PAID')).toEqual({ done: 5, current: null, failed: false });
    expect(stageOf('REJECTED').failed).toBe(true);
  });

  it('filters cover every status exactly once', () => {
    const covered = Object.values(REPORT_FILTERS).flatMap((s) => s ?? []);
    expect([...covered].sort()).toEqual([...REPORT_STATUSES].sort());
  });
});
