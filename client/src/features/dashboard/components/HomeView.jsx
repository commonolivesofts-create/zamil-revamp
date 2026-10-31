import { useRef, useState } from "react";
import OrvexaIcon from "@/components/icons/OrvexaIcon.jsx";
import ProfileAvatar from "@/components/profile/ProfileAvatar.jsx";
import useAuth from "@/features/auth/useAuth.js";
import { appConfig } from "@/config/appConfig.js";
import DashboardMeta from "@/features/dashboard/components/DashboardMeta.jsx";
import FolioBook from "@/features/dashboard/components/FolioBook.jsx";
import {
  ATTENTION_ITEMS,
  BUSINESS_SPACES,
  FOOTER_COUNTS,
  MODULES,
  QUICK_CATEGORY_IDS,
  QUICK_DEFINITIONS,
  WORKFLOW_BARS,
  displayName,
  formatDateLabel,
} from "@/features/dashboard/dashboardExperience.js";
import { scrollToSection } from "@/features/dashboard/useDashboardMotion.js";

function NameTyping({ name }) {
  const steps = Math.max(4, name.length);
  return (
    <span
      className="name-typewrap is-typing"
      aria-hidden="true"
      style={{ "--name-steps": steps }}
    >
      <span className="name-typeghost">{name}</span>
      <span
        className="name-typeink"
        style={{ animationTimingFunction: `steps(${steps}, end)` }}
      >
        {name}
      </span>
    </span>
  );
}

function QuickPanel({ category }) {
  const definition = QUICK_DEFINITIONS[category] ?? QUICK_DEFINITIONS.HR;
  const index = QUICK_CATEGORY_IDS.indexOf(category);
  return (
    <>
      <div className="quick-panel-head">
        <div>
          <span className="eyebrow">SELECTED WORKSPACE · {category}</span>
          <h3>
            <OrvexaIcon name={definition.icon} /> {category}{" "}
            <span className="quick-suffix">/ direct access</span>
          </h3>
          <p>{definition.sub}</p>
        </div>
        <span className="quick-index">0{index + 1} / 04</span>
      </div>
      <div className="quick-form-grid">
        {definition.forms.map((form, formIndex) => (
          <button
            className="quick-form"
            type="button"
            key={form.name}
            style={{ "--qi": formIndex }}
          >
            <span className="quick-form-index">0{formIndex + 1}</span>
            <span className="icon-bubble">
              <OrvexaIcon name={form.icon} />
            </span>
            <strong>{form.name}</strong>
            <small>{form.desc}</small>
            <span className="quick-form-arrow">
              <OrvexaIcon name="arrow-right" />
            </span>
          </button>
        ))}
      </div>
      <div className="quick-panel-foot">
        <span>
          <OrvexaIcon name="zap" /> Click a card to open its workflow
        </span>
        <span>
          {category === "HR" ? "4 form previews" : "Catalog previews"}
        </span>
      </div>
    </>
  );
}

export default function HomeView({
  profile,
  pages = [],
  accessStatus,
  onNavigate,
  onOpenPage,
}) {
  const [quickCategory, setQuickCategory] = useState("HR");
  const [quickPanelChanged, setQuickPanelChanged] = useState(false);
  const { updateProfileImage, removeProfileImage } = useAuth();
  const [imageBusy, setImageBusy] = useState(false);
  const [imageFeedback, setImageFeedback] = useState("");
  const [imageTarget, setImageTarget] = useState("");
  const imageTargetRef = useRef("");
  const loadedImageRef = useRef("");
  const failedImageRef = useRef("");
  const name = displayName(profile);
  const heroProfile = profile;
  const visiblePages = pages.slice(0, 4);
  const accessLoading = accessStatus === "loading";

  function waitForImage(source) {
    if (loadedImageRef.current === source) {
      imageTargetRef.current = "";
      setImageTarget("");
      return;
    }
    if (failedImageRef.current === source) {
      imageTargetRef.current = "";
      setImageTarget("");
      setImageFeedback("Photo saved, but its preview could not be loaded.");
      return;
    }
    imageTargetRef.current = source;
    setImageTarget(source);
  }

  function handleAvatarLoad(source) {
    loadedImageRef.current = source;
    failedImageRef.current = "";
    if (imageTargetRef.current === source) {
      imageTargetRef.current = "";
      setImageTarget("");
    }
  }

  function handleAvatarError(source) {
    failedImageRef.current = source;
    if (imageTargetRef.current !== source) return;
    imageTargetRef.current = "";
    setImageTarget("");
    setImageFeedback("Photo saved, but its preview could not be loaded.");
  }

  async function changeProfileImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageBusy(true);
    setImageFeedback("");
    try {
      const source = await updateProfileImage(file);
      waitForImage(source);
      setImageFeedback("Profile photo updated");
    } catch (error) {
      setImageFeedback(error.message || "Could not update the profile photo");
    } finally {
      setImageBusy(false);
    }
  }

  async function resetProfileImage() {
    setImageBusy(true);
    setImageFeedback("");
    try {
      const source = await removeProfileImage();
      waitForImage(source);
      setImageFeedback("Default photo restored");
    } catch (error) {
      setImageFeedback(error.message || "Could not restore the default photo");
    } finally {
      setImageBusy(false);
    }
  }

  const openQuick = (category) => {
    setQuickCategory(category);
    requestAnimationFrame(() => scrollToSection("quickStart"));
  };

  return (
    <>
      <DashboardMeta />
      <section
        className="hero-top zamil-hero gateway-layout"
        aria-label="Your workspace starting point"
      >
        <div className="greeting greeting-zamil gateway-copy">
          <div className="eyebrow entering-tag">
            {formatDateLabel()} &nbsp; / &nbsp; {appConfig.name.toUpperCase()}{" "}
            WORKSPACE
          </div>
          <div className="intro-overline">
            <span className="line-mark" />
            <span>GOOD WORK STARTS WITH ONE MOVE</span>
          </div>
          <div className="hero-profile">
            <div
              className={`hero-profile-photo-wrap${imageBusy || imageTarget ? " is-uploading" : ""}`}
              aria-busy={imageBusy || Boolean(imageTarget)}
            >
              <ProfileAvatar
                profile={heroProfile}
                className="hero-profile-avatar"
                onImageLoad={handleAvatarLoad}
                onImageError={handleAvatarError}
              />
              {(imageBusy || imageTarget) && (
                <span className="hero-profile-photo-loading" aria-hidden="true">
                  <span />
                </span>
              )}
              {!profile?.isPreview && (
                <label
                  className="hero-profile-photo-edit"
                  title="Change profile photo"
                >
                  <span className="sr-only">Change profile photo</span>
                  <OrvexaIcon name="pencil" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={changeProfileImage}
                    disabled={imageBusy}
                  />
                </label>
              )}
            </div>
            <div className="hero-profile-copy">
              {/* <span className="hero-profile-kicker">
                {profile?.isPreview ? "PREVIEW ACCOUNT" : "SIGNED IN AS"}
              </span> */}
              <h1
                className="kinetic-heading gateway-heading hero-profile-name"
                aria-label={name}
                data-zrv-view-title
                tabIndex={-1}
              >
                <span className="kinetic-line kinetic-v5">
                  <NameTyping name={name} />
                </span>
              </h1>
              <div className="hero-profile-details">
                <div className="hero-profile-detail">
                  <span>ROLE</span>
                  <strong>{profile?.jobTitle || "Not listed"}</strong>
                </div>
                <div className="hero-profile-detail">
                  <span>TEAM</span>
                  <strong>{profile?.department || "Not listed"}</strong>
                </div>
                {profile?.employeeNumber && (
                  <div className="hero-profile-detail hero-profile-employee">
                    <span>EMPLOYEE ID</span>
                    <strong>{profile.employeeNumber}</strong>
                  </div>
                )}
              </div>
              {!profile?.isPreview && (
                <div className="hero-profile-photo-actions">
                  <span className="hero-profile-photo-hint">Make it yours</span>
                  <button
                    className="hero-profile-reset"
                    type="button"
                    onClick={resetProfileImage}
                    disabled={imageBusy}
                  >
                    Reset photo
                  </button>
                  {imageBusy && <span role="status">Saving photo...</span>}
                  {imageFeedback && <span role="status">{imageFeedback}</span>}
                </div>
              )}
            </div>
          </div>
          {/* Temporarily hidden while the hero row alignment is tuned.
          <h2 className="kinetic-heading gateway-heading hero-tagline">
            <span className="kinetic-tagline">
              Make room for
              <br />
              <em>great work.</em>
            </span>
          </h2>
          <p className="hero-tagline-note">Your people, tools, and priorities—ready in one place.</p>
          */}

          <div
            className="gateway-actions"
            role="group"
            aria-label="Get started"
          >
            <button className="gateway-action gateway-main" type="button">
              <span className="gateway-action-icon">
                <OrvexaIcon name="search" />
              </span>
              <span className="gateway-action-copy">
                <strong>Find any page</strong>
                <small>Search all workflows</small>
              </span>
              <span className="gateway-action-tail">
                <OrvexaIcon name="arrow-right" />
              </span>
            </button>
            <button
              className="gateway-action"
              type="button"
              onClick={() => openQuick("HR")}
            >
              <span className="gateway-action-icon">
                <OrvexaIcon name="users" />
              </span>
              <span className="gateway-action-copy">
                <strong>Open HR forms</strong>
                <small>4 forms · one touch</small>
              </span>
              <span className="gateway-action-tail">
                <OrvexaIcon name="arrow-right" />
              </span>
            </button>
            <button className="gateway-action" type="button">
              <span className="gateway-action-icon">
                <OrvexaIcon name="file-text" />
              </span>
              <span className="gateway-action-copy">
                <strong>Create credit note</strong>
                <small>Finance workflow</small>
              </span>
              <span className="gateway-action-tail">
                <OrvexaIcon name="arrow-right" />
              </span>
            </button>
          </div>
          <div className="gateway-hint">
            Start here, or use the sidebar or <kbd>Ctrl K</kbd> at any time.
          </div>
        </div>
        <FolioBook onNavigate={onNavigate} />
      </section>

      <div className="section-line section-quick" id="quickStart">
        <div>
          <span className="eyebrow">01 / ACCESS WITHOUT FRICTION</span>
          <h2>
            Quick Links <span className="inline-accent">/ one touch away</span>
          </h2>
          <p>
            Choose a department. Its four most useful forms appear immediately.
          </p>
        </div>
        <button
          className="btn tiny quiet"
          type="button"
          onClick={() => onNavigate("atlas")}
        >
          Discover all modules <OrvexaIcon name="arrow-right" />
        </button>
      </div>
      <section className="quick-shell" data-zrv-reveal>
        <div className="quick-categories">
          {QUICK_CATEGORY_IDS.map((category, index) => {
            const definition = QUICK_DEFINITIONS[category];
            return (
              <button
                className={`quick-category ${quickCategory === category ? "selected" : ""}`}
                type="button"
                key={category}
                onClick={() => {
                  if (quickCategory !== category) {
                    setQuickCategory(category);
                    setQuickPanelChanged(true);
                  }
                }}
                aria-pressed={quickCategory === category}
              >
                <span className="cat-id">0{index + 1}</span>
                <span className="cat-icon">
                  <OrvexaIcon name={definition.icon} />
                </span>
                <span className="cat-copy">
                  <strong>{category}</strong>
                  <small>{definition.forms.length} direct shortcuts</small>
                </span>
                <span className="cat-arrow">
                  <OrvexaIcon name="arrow-right" />
                </span>
              </button>
            );
          })}
        </div>
        <div
          className={`quick-panel${quickPanelChanged ? " panel-swap" : ""}`}
          id="quickPanel"
          key={quickCategory}
          aria-live="polite"
        >
          <QuickPanel category={quickCategory} />
        </div>
      </section>

      <div className="section-line section-intelligence">
        <div>
          <span className="eyebrow">02 / PERSONAL WORKSPACE</span>
          <h2>Your access, in reach.</h2>
          <p>
            Real pages from your signed-in permissions — no setup, no guesswork.
          </p>
        </div>
        <span className="privacy-chip">
          <OrvexaIcon name="shield-check" /> Live permissions
        </span>
      </div>
      <section className="habit-shell" data-zrv-reveal>
        <div className="habit-feature">
          <span className="habit-kicker">
            <OrvexaIcon name="sparkles" /> SMART ACCESS
          </span>
          <div className="habit-orb">
            <span>
              <OrvexaIcon name="zap" className="icon-xl" />
            </span>
          </div>
          <h3>
            Your access.
            <br />
            <em>Already mapped.</em>
          </h3>
          <p>
            Every page here is one your account can open. The list follows your
            permissions, not local browsing habits.
          </p>
          <button className="btn tiny ghost" type="button">
            Search anything <OrvexaIcon name="arrow-right" />
          </button>
        </div>
        <div className="habit-list">
          <div className="habit-head">
            <span>AUTHORIZED PAGES</span>
            <span>
              {accessLoading ? "CHECKING ACCESS" : `${pages.length} AVAILABLE`}
            </span>
          </div>
          {visiblePages.map((page, index) => (
            <button
              className="habit-row"
              type="button"
              key={page.id}
              style={{ "--hi": index }}
              onClick={() => onOpenPage(page)}
            >
              <span className="habit-no">0{index + 1}</span>
              <span className="habit-symbol">
                <OrvexaIcon name={page.icon || "layout-grid"} />
              </span>
              <span className="habit-copy">
                <strong>{page.label}</strong>
                <small>
                  {page.sectionLabel}
                  {page.type === "external"
                    ? " · External destination"
                    : page.path
                      ? ` · ${page.path}`
                      : ""}
                </small>
              </span>
              <span className="habit-open">
                Open <OrvexaIcon name="arrow-right" className="icon-sm" />
              </span>
            </button>
          ))}
          {!visiblePages.length && (
            <div className="habit-note" role="status">
              {accessLoading
                ? "Checking the pages available to this account…"
                : "No application pages are available for this account. Sign in or ask an administrator for access."}
            </div>
          )}
          {visiblePages.length > 0 && (
            <div className="habit-note">
              {pages.length > visiblePages.length
                ? `Showing ${visiblePages.length} of ${pages.length} pages. The sidebar lists every page you can open.`
                : "Every page your account can open is listed here."}
            </div>
          )}
        </div>
      </section>

      <div className="section-line" style={{ marginTop: 46 }}>
        <div>
          <span className="eyebrow">03 / WHAT NEEDS YOU</span>
          <h2>Work, moving forward.</h2>
          <p>
            A clear view of your next actions and your team&apos;s momentum.
          </p>
        </div>
        <button className="btn tiny quiet" type="button">
          See activity <OrvexaIcon name="arrow-right" />
        </button>
      </div>
      <div className="feature-grid" data-zrv-reveal>
        <section className="surface feature-primary">
          <div>
            <div className="eyebrow">
              YOUR NEXT ACTION &nbsp; · &nbsp; FINANCE
            </div>
            <h3>
              Less navigating.
              <br />
              More doing.
            </h3>
            <p>
              Continue the Credit Note flow with all required fields, dynamic
              invoice lines, and local draft saving.
            </p>
          </div>
          <div className="foot">
            <button className="btn primary" type="button">
              Open Credit Note <OrvexaIcon name="arrow-right" />
            </button>
            <span className="pill">Demo workflow</span>
          </div>
        </section>
        <section className="surface feature-mini">
          <div className="subhead">
            <h3>Attention queue</h3>
            <span className="icon-bubble">
              <OrvexaIcon name="check" />
            </span>
          </div>
          {ATTENTION_ITEMS.map((item) => (
            <div className="queue-line" key={item.label}>
              <div>
                <strong>{item.label}</strong>
                <small>{item.team} · Demo</small>
              </div>
              {item.count.includes("new") ? (
                <span className="queue-pill">{item.count}</span>
              ) : (
                <b>{item.count}</b>
              )}
            </div>
          ))}
          <div className="push">
            <button className="btn tiny ghost full" type="button">
              Review queue <OrvexaIcon name="arrow-right" />
            </button>
          </div>
        </section>
        <section className="surface feature-mini">
          <div className="subhead">
            <h3>Workflow pulse</h3>
            <span className="icon-bubble">
              <OrvexaIcon name="chart-column" />
            </span>
          </div>
          <div
            className="horizon-bars"
            role="img"
            aria-label="Illustrative workflow pulse bars"
          >
            {WORKFLOW_BARS.map((height, index) => (
              <i key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="metric-bottom">
            <div>
              <small className="secondary">Demo activity</small>
              <br />
              <strong>86.4%</strong>
            </div>
            <span>↑ +12.8%</span>
          </div>
        </section>
      </div>

      <div className="section-line" style={{ marginTop: 39 }}>
        <div>
          <h2>Business spaces</h2>
          <p>A single, scalable doorway to the wider organization</p>
        </div>
        <button
          className="btn tiny quiet"
          type="button"
          onClick={() => onNavigate("atlas")}
        >
          Explore {MODULES.length} entries <OrvexaIcon name="arrow-right" />
        </button>
      </div>
      <div className="domain-grid" data-zrv-reveal>
        {BUSINESS_SPACES.map((space) => (
          <button
            className="domain-card"
            type="button"
            key={space.name}
            onClick={() => onNavigate("atlas", { domain: space.name })}
          >
            <span className="icon-bubble">
              <OrvexaIcon name={space.icon} />
            </span>
            <div>
              <strong>{space.name}</strong>
              <small>{space.description}</small>
            </div>
            <OrvexaIcon name="arrow-right" className="ic tail" />
          </button>
        ))}
      </div>
      <footer className="footnote">
        <span>
          <b>{appConfig.name.toUpperCase()} / DIGITAL WORKSPACE</b> &nbsp; ·
          &nbsp; Interactive design concept
        </span>
        <span>
          {FOOTER_COUNTS.modules} catalog previews · {FOOTER_COUNTS.views}{" "}
          interactive {FOOTER_COUNTS.views === 1 ? "view" : "views"}
        </span>
      </footer>
    </>
  );
}
