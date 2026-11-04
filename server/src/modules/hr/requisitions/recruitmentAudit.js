import { AUDIT_EVENTS, AUDIT_OUTCOMES, ACTOR_TYPES } from '../../audit/securityAudit.service.js';

/** Every recruitment change is audited in the same transaction as its business write. */
export async function recordRecruitmentChange(
  auditService,
  connection,
  {
    actor,
    requisitionId,
    oldValue,
    newValue,
    reason = null,
    source,
    offerId = null,
    acceptedDate = null,
  },
) {
  await auditService.record(connection, {
    eventCode: AUDIT_EVENTS.RECRUITMENT_STATUS_CHANGED,
    outcome: AUDIT_OUTCOMES.SUCCESS,
    actorType: ACTOR_TYPES.USER,
    actorUserId: actor.userId,
    target: { type: 'PERSONNEL_REQUISITION', id: requisitionId },
    details: {
      actorUserId: actor.userId,
      changedAt: new Date().toISOString(),
      oldValue,
      newValue,
      reason,
      source,
      offerId,
      acceptedDate,
    },
  });
}
