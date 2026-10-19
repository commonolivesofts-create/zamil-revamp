const INSERT_EVENT_SQL = `
  INSERT INTO xx_zrv_rbac_audit_logs (
    event_code, event_outcome, actor_type, subject_user_id, target_type, target_record_id,
    reason_code, correlation_id, client_ip_address, user_agent, event_details, created_by
  ) VALUES (
    :eventCode, :eventOutcome, :actorType, :subjectUserId, :targetType, :targetRecordId,
    :reasonCode, :correlationId, :clientIpAddress, :userAgent, :eventDetails, :createdBy
  )`;

/** Appends one security audit event. Rows in this table are never updated or deleted. */
export async function insertAuditEvent(connection, event) {
  await connection.execute(INSERT_EVENT_SQL, {
    eventCode: event.eventCode,
    eventOutcome: event.eventOutcome,
    actorType: event.actorType,
    subjectUserId: event.subjectUserId,
    targetType: event.targetType,
    targetRecordId: event.targetRecordId,
    reasonCode: event.reasonCode,
    correlationId: event.correlationId,
    clientIpAddress: event.clientIpAddress,
    userAgent: event.userAgent,
    eventDetails: event.eventDetails,
    createdBy: event.createdBy,
  });
}
