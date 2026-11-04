import { Link } from "react-router";
import usePermissions from "@/features/access/usePermissions.js";
import OrvexaIcon from "@/components/icons/OrvexaIcon.jsx";
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from "../hrRecruitmentActions.js";

export function CreateInterviewAssessment({ row, compact = false }) {
  const permissions = usePermissions();
  if (row.status !== "Approved" || !row.requisitionNumber || !permissions.can(ACTIONS.INTERVIEW_CREATE)) return null;

  return (
    <Link
      className={`zrv-ir-btn${compact ? " zrv-ir-btn--assessment-compact" : ""}`}
      to={`/hr/recruitment/interview?requisitionNumber=${encodeURIComponent(row.requisitionNumber)}`}
      onClick={(event) => event.stopPropagation()}
      aria-label={`Create interview assessment for ${row.requisitionNumber}`}
      title={`Create an interview assessment for requisition ${row.requisitionNumber}`}
    >
      <OrvexaIcon name="file-plus" size={16} />
      {compact ? <span>Create interview<small>assessment</small></span> : "Create interview assessment"}
    </Link>
  );
}
