import { appConfig } from "@/config/appConfig.js";
import { ZAMIL_LOGO_SRC } from "@/features/dashboard/dashboardExperience.js";

// The application shell owns the real navigation and account menu. This strip
// belongs to the dashboard canvas: it gives the page the approved identity and
// makes the signed-in employee record visible without leaving the page.
export default function DashboardMeta() {
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
    </header>
  );
}
