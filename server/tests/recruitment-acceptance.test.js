import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmploymentOfferService } from '../src/modules/hr/employment-offers/employmentOffer.service.js';

function fixture({
  isHr = true,
  status = 'Open',
  fail = false,
  links = 1,
  approval = 'Approved',
  auditFail = false,
} = {}) {
  let state = {
    offer: { headerId: '10', reqNo: '20', status: 'Incomplete', offerDate: '2020-01-01' },
    requisition: {
      REQUISITION_ID: '20',
      RECRUITMENT_STATUS: status,
      ACCEPTED_DATE: null,
      approval: 'Approved',
      APPROVAL_STATUS: approval,
    },
    events: [],
  };
  const repository = {
    isHrUser: async () => isHr,
    findHeader: async () => ({ ...state.offer }),
    findRequisitionsForAcceptance: async () =>
      Array.from({ length: links }, () => ({ ...state.requisition })),
    recordAcceptance: async (_c, { acceptedDate }) => {
      state.requisition.RECRUITMENT_STATUS = 'Accepted';
      state.requisition.ACCEPTED_DATE = acceptedDate;
      if (fail) throw new Error('offer write failed');
      state.offer.status = 'Accepted';
    },
  };
  const service = createEmploymentOfferService({
    repository,
    auditService: {
      record: async (_c, event) => {
        if (auditFail) throw new Error('audit write failed');
        state.events.push(event);
      },
    },
    withTransaction: async (_pool, work) => {
      const snapshot = structuredClone(state);
      try {
        return await work({});
      } catch (error) {
        state = snapshot;
        throw error;
      }
    },
  });
  return { service, state: () => state };
}

describe('offer acceptance and requisition fulfillment', () => {
  it('requires approval and rolls back both records if the acceptance audit fails', async () => {
    const unapproved = fixture({ approval: 'Draft' });
    await assert.rejects(
      unapproved.service.accept({ userId: '1' }, '10', { acceptedDate: '2020-01-02' }),
      { code: 'REQUISITION_NOT_APPROVED' },
    );
    const f = fixture({ auditFail: true });
    await assert.rejects(
      f.service.accept({ userId: '1' }, '10', { acceptedDate: '2020-01-02' }),
      /audit write failed/,
    );
    assert.equal(f.state().requisition.RECRUITMENT_STATUS, 'Open');
    assert.equal(f.state().offer.status, 'Incomplete');
    assert.equal(f.state().events.length, 0);
  });
  it('records the real acceptance date atomically without changing approval or closing recruitment', async () => {
    const f = fixture();
    await f.service.accept({ userId: '1' }, '10', { acceptedDate: '2020-01-02' });
    assert.equal(f.state().requisition.ACCEPTED_DATE, '2020-01-02');
    assert.equal(f.state().requisition.RECRUITMENT_STATUS, 'Accepted');
    assert.equal(f.state().requisition.approval, 'Approved');
    assert.equal(f.state().offer.status, 'Accepted');
    assert.equal(f.state().events[0].actorUserId, '1');
    assert.equal(f.state().events[0].details.oldValue, 'Open');
    assert.equal(f.state().events[0].details.newValue, 'Accepted');
    assert.equal(f.state().events[0].details.acceptedDate, '2020-01-02');
    await f.service.accept({ userId: '1' }, '10', { acceptedDate: '2020-01-02' });
    assert.equal(f.state().events.length, 1);
    await assert.rejects(f.service.accept({ userId: '1' }, '10', { acceptedDate: '2020-01-03' }), {
      code: 'ALREADY_ACCEPTED',
    });
  });

  it('enforces HR membership even for callers with offer UPDATE access', async () => {
    const f = fixture({ isHr: false });
    await assert.rejects(f.service.accept({ userId: '2' }, '10', { acceptedDate: '2020-01-02' }), {
      code: 'HR_ONLY',
    });
    assert.equal(f.state().requisition.RECRUITMENT_STATUS, 'Open');
  });

  it('rejects missing or ambiguous requisition links and non-open recruitment', async () => {
    for (const links of [0, 2]) {
      const f = fixture({ links });
      await assert.rejects(
        f.service.accept({ userId: '1' }, '10', { acceptedDate: '2020-01-02' }),
        { code: 'REQUISITION_LINK_REQUIRED' },
      );
    }
    for (const status of ['Close', 'Cancelled', 'On Hold']) {
      const f = fixture({ status });
      await assert.rejects(
        f.service.accept({ userId: '1' }, '10', { acceptedDate: '2020-01-02' }),
        { code: 'REQUISITION_NOT_OPEN' },
      );
    }
  });

  it('rejects acceptance before the offer or in the future', async () => {
    const f = fixture();
    for (const acceptedDate of ['2019-12-31', '2999-01-01']) {
      await assert.rejects(f.service.accept({ userId: '1' }, '10', { acceptedDate }), {
        code: 'INVALID_ACCEPTANCE_DATE',
      });
    }
  });

  it('rolls back the requisition update if the offer write fails', async () => {
    const f = fixture({ fail: true });
    await assert.rejects(
      f.service.accept({ userId: '1' }, '10', { acceptedDate: '2020-01-02' }),
      /offer write failed/,
    );
    assert.equal(f.state().requisition.ACCEPTED_DATE, null);
    assert.equal(f.state().requisition.RECRUITMENT_STATUS, 'Open');
  });
});
