import { appConfig } from "@/config/appConfig.js";
import {
  displayName,
  initialsOf,
  ZAMIL_LOGO_SRC,
} from "@/features/dashboard/dashboardExperience.js";

// The application shell owns the real navigation and account menu. This strip
// belongs to the dashboard canvas: it gives the page the approved identity and
// makes the signed-in employee record visible without leaving the page.
export default function DashboardMeta({ profile, onOpenProfile }) {
  const name = displayName(profile);
  const role =
    [profile?.jobTitle, profile?.department].filter(Boolean).join(" · ") ||
    (profile?.isPreview ? "Design preview" : "Signed-in employee");
  const badge = profile?.isPreview
    ? "Workspace · Preview"
    : profile?.employeeNumber
      ? `Employee ${profile.employeeNumber}`
      : "Signed-in workspace";

  return (
    <header className="hero-meta">
      <span
        className="sitebrand"
        aria-label={`${appConfig.name} digital workspace`}
      >
        <span className="zamil-lockup">
          <img src={ZAMIL_LOGO_SRC} alt="" />
        </span>
        <span className="brand-divider" aria-hidden="true" />
        <span className="brand-subtitle">
          DIGITAL WORKSPACE
          <small>Enterprise Operations</small>
        </span>
      </span>
      <div className="meta-right">
        <span className="pill">
          <i className="pulse" aria-hidden="true" />
          {badge}
        </span>
        <button
          className="avatar-wrap"
          type="button"
          onClick={onOpenProfile}
          aria-label={`Open profile for ${name}`}
          aria-haspopup="dialog"
          title="View employee profile"
        >
          <span className="avatar" aria-hidden="true">
            {initialsOf(name)}
          </span>
          <span>
            <strong>{name}</strong>
            <small>{role}</small>
          </span>
        </button>
      </div>
    </header>
  );
}
