import { useRef, useState } from "react";
import OrvexaIcon from "@/components/icons/OrvexaIcon.jsx";
import ProfileAvatar from "@/components/profile/ProfileAvatar.jsx";
import useAuth from "@/features/auth/useAuth.js";
import { appConfig } from "@/config/appConfig.js";
import DashboardMeta from "@/features/dashboard/components/DashboardMeta.jsx";
import FolioBook from "@/features/dashboard/components/FolioBook.jsx";
import EmployeeSpotlightFireworks from "@/features/dashboard/components/EmployeeSpotlightFireworks.jsx";
import usePermissions from "@/features/access/usePermissions.js";
import { useResource } from "@/features/security-administration/useAdminData.js";
import { rewardService } from "@/features/hr-employee-services/reward/rewardService.js";
import { enDate } from "@/features/hr-recruitment/shared/hrFormat.js";
import {
  ATTENTION_ITEMS,
  FOOTER_COUNTS,
  QUICK_CATEGORY_IDS,
  QUICK_DEFINITIONS,
  displayName,
  formatDateLabel,
} from "@/features/dashboard/dashboardExperience.js";

function NameTyping({ name }) {
  const steps = Math.max(4, name.length);
  return (
    <span className="name-typewrap is-typing" aria-hidden="true" style={{ "--name-steps": steps }}>
      <span className="name-typeghost">{name}</span>
      <span className="name-typeink" style={{ animationTimingFunction: `steps(${steps}, end)` }}>
        {name}
      </span>
    </span>
  );
}

const EMPLOYEE_SHARE_LINKS = [
  {
    name: "LinkedIn",
    className: "linkedin",
    href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Facebook",
    className: "facebook",
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: "X",
    className: "x-network",
    href: (url) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent("Explore the Zamil workspace")}`,
  },
];

function EmployeeSocialLinks() {
  const shareUrl = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="hero-social-fan is-persistent" aria-label="Share your workspace">
      <span className="hero-social-toggle-mark" aria-hidden="true">
        <OrvexaIcon name="share-2" />
      </span>
      <span className="hero-social-toggle-copy">
        <strong>Share your workspace</strong>
      </span>
      <div className="hero-social-fan-menu" aria-label="Share on social media">
        {EMPLOYEE_SHARE_LINKS.map((network) => (
          <a
            className={`hero-social-link ${network.className}`}
            href={network.href(shareUrl)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share on ${network.name}`}
            key={network.name}
          >
            <span className="hero-social-icon">
              <SocialMark network={network.name} />
            </span>
            <span className="hero-social-label">{network.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function SocialMark({ network }) {
  const paths = {
    LinkedIn:
      "M5.2 8.6H2.1V22h3.1V8.6ZM3.7 2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6ZM22 14.3c0-4-2.1-5.9-4.9-5.9a4.2 4.2 0 0 0-3.8 2.1V8.6h-3V22h3.1v-6.6c0-1.8.3-3.6 2.6-3.6s2.3 2.1 2.3 3.7V22h3.1l.6-7.7Z",
    Facebook:
      "M14.1 22v-9h3l.5-3.5h-3.5V7.2c0-1 .3-1.7 1.8-1.7h1.9V2.4c-.3 0-1.5-.1-2.9-.1-2.9 0-4.9 1.8-4.9 5v2.2H6.8V13H10v9h4.1Z",
    X: "M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.6 22H2.4l7.3-8.4L1.8 2h6.5l4.5 6.8L18.9 2Zm-1.1 17.8h1.7L7.3 4.1H5.5l12.3 15.7Z",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[network]} />
    </svg>
  );
}

const HR_USAGE_KEY = "zrv-dashboard-hr-form-usage";
function readHrUsage() {
  try {
    return JSON.parse(window.localStorage.getItem(HR_USAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function QuickPanel({ category, hrPages = [], hrUsage = {}, onOpenHrPage }) {
  const definition = QUICK_DEFINITIONS[category] ?? QUICK_DEFINITIONS.HR;
  const index = QUICK_CATEGORY_IDS.indexOf(category);
  const forms =
    category === "HR"
      ? [...hrPages]
          .sort((a, b) => (hrUsage[b.id] || 0) - (hrUsage[a.id] || 0))
          .slice(0, 6)
          .map((page) => ({
            id: page.id,
            name: page.label,
            desc: page.subgroup || "Human resources",
            icon: page.icon || "file-text",
            page,
          }))
      : definition.forms;
  return (
    <>
      <div className="quick-panel-head">
        <div>
          <span className="eyebrow">SELECTED WORKSPACE · {category}</span>
          <h3>
            <OrvexaIcon name={definition.icon} /> {category} <span className="quick-suffix">/ direct access</span>
          </h3>
          <p>{definition.sub}</p>
        </div>
        <span className="quick-index">0{index + 1} / 04</span>
      </div>
      <div className="quick-form-grid">
        {forms.map((form, formIndex) => (
          <button
            className="quick-form"
            type="button"
            key={form.name}
            style={{ "--qi": formIndex }}
            onClick={form.page ? () => onOpenHrPage(form.page) : undefined}
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
        <span>{category === "HR" ? `${forms.length} frequently used forms` : "Catalog previews"}</span>
      </div>
    </>
  );
}

async function optimizeProfileImage(file) {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const maxDimension = 512;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 250 * 1024) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const optimized = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!optimized || optimized.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "profile";
    return new File([optimized], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

export default function HomeView({ profile, pages = [], onNavigate, onOpenPage }) {
  const [quickCategory, setQuickCategory] = useState("HR");
  const [quickPanelChanged, setQuickPanelChanged] = useState(false);
  const [hrUsage, setHrUsage] = useState(readHrUsage);
  const { updateProfileImage, removeProfileImage } = useAuth();
  const permissions = usePermissions();
  const employeeOfMonth = useResource(
    permissions.can("HR.EMPLOYEE_OF_THE_MONTH:VIEW") ? "dashboard-employee-of-month" : null,
    async (signal) => {
      const result = await rewardService.list(
        {
          status: "APPROVED",
          page: 1,
          pageSize: 25,
          sort: "activityDate",
          order: "desc",
        },
        { signal },
      );
      const latest = result.items.find((item) => item.status === "APPROVED");
      return latest ? rewardService.getById(latest.nominationId, { signal }) : null;
    },
  );
  const [imageBusy, setImageBusy] = useState(false);
  const [imageFeedback, setImageFeedback] = useState("");
  const [imageTarget, setImageTarget] = useState("");
  const imageTargetRef = useRef("");
  const loadedImageRef = useRef("");
  const failedImageRef = useRef("");
  const name = displayName(profile);
  const heroProfile = profile;

  function openAttentionItem(item) {
    const terms = item.matchTerms ?? [];
    const target = pages.find((page) => {
      const searchText = `${page.label} ${page.sectionLabel}`.toLowerCase();
      return terms.some((term) => searchText.includes(term));
    });
    if (target) onOpenPage(target);
    else onNavigate("atlas", { domain: item.team });
  }

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
      const source = await updateProfileImage(await optimizeProfileImage(file));
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

  const hrPages = pages.filter((page) => page.sectionLabel === "Human resources" || page.section === "human-resources");
  const openHrPage = (page) => {
    const next = { ...hrUsage, [page.id]: (hrUsage[page.id] || 0) + 1 };
    setHrUsage(next);
    window.localStorage.setItem(HR_USAGE_KEY, JSON.stringify(next));
    onOpenPage(page);
  };

  return (
    <>
      <DashboardMeta />
      <section className="hero-top zamil-hero gateway-layout" aria-label="Your workspace starting point">
        <div className="greeting greeting-zamil gateway-copy">
          <div className="eyebrow entering-tag">
            {formatDateLabel()} &nbsp; / &nbsp; {appConfig.name.toUpperCase()} WORKSPACE
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
                <label className="hero-profile-photo-edit" title="Change profile photo">
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
              <div className="hero-profile-social-row">
                <EmployeeSocialLinks />
              </div>
              {!profile?.isPreview && (
                <div className="hero-profile-photo-actions">
                  <span className="hero-profile-photo-hint">Make it yours</span>
                  <button className="hero-profile-reset" type="button" onClick={resetProfileImage} disabled={imageBusy}>
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

          <div className="gateway-actions" role="group" aria-label="Get started">
            <button
              className="gateway-action gateway-main"
              type="button"
              onClick={() => onOpenPage({ path: "/worklist/pending" })}
            >
              <span className="gateway-action-icon">
                <OrvexaIcon name="list-checks" />
              </span>
              <span className="gateway-action-copy">
                <strong>Pending Worklist</strong>
                <small>
                  Pending items <span aria-label="count unavailable">—</span>
                </small>
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
        <FolioBook onNavigate={onNavigate} hrPages={hrPages} onOpenPage={onOpenPage} />
      </section>

      <div className="section-line section-quick" id="quickStart">
        <div>
          <span className="eyebrow">01 / ACCESS WITHOUT FRICTION</span>
          <h2>
            Quick Links <span className="inline-accent">/ one touch away</span>
          </h2>
          <p>Your six most frequently used HR forms are ready on the right.</p>
        </div>
        <button className="btn tiny quiet" type="button" onClick={() => onNavigate("atlas")}>
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
          <QuickPanel category={quickCategory} hrPages={hrPages} hrUsage={hrUsage} onOpenHrPage={openHrPage} />
        </div>
      </section>

      <div className="section-line section-intelligence">
        <div>
          <span className="eyebrow">02 / PERSONAL WORKSPACE</span>
          <h2>Employee of the month.</h2>
          <p>Recognising the people whose work makes a difference.</p>
        </div>
        <span className="privacy-chip">
          <OrvexaIcon name="award" /> Team recognition
        </span>
      </div>
      <section className="employee-spotlight" data-zrv-reveal aria-label="Employee of the month">
        {employeeOfMonth.status === "idle" && (
          <div className="employee-spotlight-empty">Employee recognition is available to authorised team members.</div>
        )}
        {employeeOfMonth.status === "loading" && (
          <div className="employee-spotlight-empty" role="status">
            Loading employee recognition...
          </div>
        )}
        {employeeOfMonth.status === "error" && (
          <div className="employee-spotlight-empty" role="status">
            Employee recognition is temporarily unavailable.
          </div>
        )}
        {employeeOfMonth.status === "ready" && employeeOfMonth.data && (
          <>
            <EmployeeSpotlightFireworks />
            <div className="employee-spotlight-person">
              <span className="employee-spotlight-congrats">
                <OrvexaIcon name="award" size={14} /> Congratulations!
              </span>
              <div className="employee-spotlight-photo-wrap">
                <img
                  className="employee-spotlight-photo"
                  src={
                    profile.employeeNumber === employeeOfMonth.data.employee.employeeNumber
                      ? profile.avatarUrl || "/profile-placeholder.png"
                      : "/profile-placeholder.png"
                  }
                  alt={
                    profile.employeeNumber === employeeOfMonth.data.employee.employeeNumber && profile.avatarUrl
                      ? `${employeeOfMonth.data.employee.name} portrait`
                      : "Employee photo placeholder"
                  }
                  onError={(event) => {
                    event.currentTarget.src = "/profile-placeholder.png";
                  }}
                />
                <span className="employee-spotlight-medal" aria-label="Approved employee recognition">
                  <OrvexaIcon name="award" />
                </span>
                <span className="employee-spotlight-celebration" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => (
                    <i key={index} />
                  ))}
                </span>
              </div>
              <span className="employee-spotlight-kicker">RECOGNISED TEAM MEMBER</span>
              <h3>{employeeOfMonth.data.employee.name}</h3>
              <p className="employee-spotlight-role">{employeeOfMonth.data.employee.position || "Employee"}</p>
              <dl className="employee-spotlight-details">
                <div>
                  <dt>Employee no.</dt>
                  <dd>{employeeOfMonth.data.employee.employeeNumber}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{employeeOfMonth.data.employee.departmentName || "—"}</dd>
                </div>
                <div>
                  <dt>Recognition date</dt>
                  <dd>{employeeOfMonth.data.activityDate ? enDate(employeeOfMonth.data.activityDate) : "—"}</dd>
                </div>
              </dl>
            </div>
            <div className="employee-spotlight-reason">
              <div className="employee-spotlight-reason-head">
                <span className="employee-spotlight-kicker">WHY THEY WERE RECOGNISED</span>
                <span className="employee-spotlight-rating">{employeeOfMonth.data.overallRating || "APPROVED"}</span>
              </div>
              <h3>A contribution worth celebrating.</h3>
              <p className="employee-spotlight-remark">
                {employeeOfMonth.data.remark || "Their contribution was recognised by the team."}
              </p>
              {!!employeeOfMonth.data.lines.length && (
                <ul className="employee-spotlight-evidence">
                  {employeeOfMonth.data.lines.map((line) => (
                    <li key={line.lineNumber}>
                      <span>
                        <OrvexaIcon name="check" /> {line.criterion}
                      </span>
                      <p>{line.remark}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        {employeeOfMonth.status === "ready" && !employeeOfMonth.data && (
          <div className="employee-spotlight-empty">
            <OrvexaIcon name="sparkles" /> No approved employee recognition is available yet.
          </div>
        )}
      </section>

      <div className="section-line" style={{ marginTop: 46 }}>
        <div>
          <span className="eyebrow">03 / TEAM ANNOUNCEMENTS</span>
          <h2>Stay in the loop.</h2>
          <p>Updates from across your workspace, in one place.</p>
        </div>
      </div>
      <div className="attention-announcement" role="region" aria-label="Attention queue announcement" tabIndex={0}>
        <div className="attention-announcement-head">
          <span className="attention-announcement-label">
            <OrvexaIcon name="sparkles" /> ANNOUNCEMENT
          </span>
          <span className="attention-announcement-caption">
            Workspace updates <i /> Moving continuously
          </span>
        </div>
        <div className="attention-announcement-window">
          <p className="attention-announcement-sr">
            {ATTENTION_ITEMS.map((item) => `${item.count} ${item.label} in ${item.team}`).join(". ")}
          </p>
          <div className="attention-announcement-track" aria-hidden="true">
            {[0, 1].map((copy) => (
              <span className="attention-announcement-copy" key={copy}>
                {ATTENTION_ITEMS.map((item) => (
                  <span className="attention-announcement-item" key={`${copy}-${item.label}`}>
                    <i /> {item.count} {item.label} <small>{item.team}</small>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="section-line attention-section-line">
        <div>
          <span className="eyebrow">04 / WHAT NEEDS YOU</span>
          <h2>Your next actions.</h2>
          <p>Review the items waiting for your attention.</p>
        </div>
        <button
          className="btn tiny quiet"
          type="button"
          onClick={() =>
            document.getElementById("attentionQueueTitle")?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        >
          View queue <OrvexaIcon name="arrow-right" />
        </button>
      </div>
      <section className="attention-queue surface" data-zrv-reveal aria-labelledby="attentionQueueTitle">
        <div className="attention-queue-head">
          <div>
            <span className="eyebrow">YOUR WORK, AT A GLANCE</span>
            <h3 id="attentionQueueTitle">Items to review</h3>
            <p>Choose an item to open its workspace and continue.</p>
          </div>
          <span className="attention-preview-badge">PREVIEW QUEUE</span>
        </div>
        <div className="attention-table-wrap">
          <table className="attention-table">
            <thead>
              <tr>
                <th scope="col">Work item</th>
                <th scope="col">Team</th>
                <th scope="col">Waiting</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {ATTENTION_ITEMS.map((item, index) => (
                <tr className={`attention-row attention-row-${index + 1}`} key={item.label}>
                  <td>
                    <span className="attention-work-icon">
                      <OrvexaIcon name={item.icon || "clipboard-list"} />
                    </span>
                    <span className="attention-work-copy">
                      <strong>{item.label}</strong>
                      <small>Needs review</small>
                    </span>
                  </td>
                  <td>
                    <span className="attention-team-tag">{item.team}</span>
                  </td>
                  <td>
                    <span className="attention-count">{item.count}</span>
                  </td>
                  <td>
                    <button className="attention-action" type="button" onClick={() => openAttentionItem(item)}>
                      Take action <OrvexaIcon name="arrow-right" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="footnote">
        <span>
          <b>{appConfig.name.toUpperCase()} / DIGITAL WORKSPACE</b> &nbsp; · &nbsp; Interactive design concept
        </span>
        <span>
          {FOOTER_COUNTS.modules} catalog previews · {FOOTER_COUNTS.views} interactive{" "}
          {FOOTER_COUNTS.views === 1 ? "view" : "views"}
        </span>
      </footer>
    </>
  );
}
