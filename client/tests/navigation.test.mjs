// Stage 2: shared route/navigation configuration, route guard decisions,
// sidebar, command palette, dashboard and demo-route isolation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PERMISSIONS,
  appRoutes,
  authorizedNavigation,
  canAccessRoute,
  findAppRoute,
  implementedRoutes,
  navigationSections,
  paletteCommands,
  routeAccess,
  searchCommands,
} from "../src/config/appNavigation.js";
import { orvexaDemoRoutes } from "../src/config/orvexaRoutes.js";
import {
  formatDateTime,
  groupPermissions,
  humanizeCode,
} from "../src/features/security-administration/permissionPresentation.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Permission states as exposed by usePermissions().
const ready = (keys, mfaVerified = true) => {
  const set = new Set(keys);
  return { status: "ready", mfaVerified, has: (key) => set.has(key) };
};
const ADMIN = ready(Object.values(PERMISSIONS));
const ADMIN_WITHOUT_MFA = ready(Object.values(PERMISSIONS), false);
const EMPLOYEE = ready(["PRODUCTION.WORK_ORDERS:VIEW"], false);
const EMPTY = ready([]);
const LOADING = { status: "loading", mfaVerified: false, has: () => false };
const FAILED = { status: "error", mfaVerified: false, has: () => false };
const IDLE = { status: "idle", mfaVerified: false, has: () => false };

// The Stage 3 screens, as if implemented, to exercise permission filtering.
const stage3Routes = appRoutes.map((route) => ({
  ...route,
  implemented: true,
}));
const securityRoutes = stage3Routes.filter(
  (route) => route.section === "security",
);
const ids = (sections) =>
  sections.flatMap((section) => section.items.map((item) => item.id));

// ------------------------------------------------------------ configuration

test("the shared configuration uses the backend permission identities", () => {
  assert.deepEqual(Object.values(PERMISSIONS).sort(), [
    "SECURITY_ADMINISTRATION.PERMISSION_CATALOG:VIEW",
    "SECURITY_ADMINISTRATION.ROLES:VIEW",
    "SECURITY_ADMINISTRATION.ROLE_PERMISSIONS:VIEW",
    "SECURITY_ADMINISTRATION.SECURITY_AUDIT:VIEW",
    "SECURITY_ADMINISTRATION.USER_ACCOUNTS:VIEW",
    "SECURITY_ADMINISTRATION.USER_PERMISSION_OVERRIDES:VIEW",
    "SECURITY_ADMINISTRATION.USER_ROLES:VIEW",
  ]);
  const unique = (values) => new Set(values).size === values.length;
  assert.ok(
    unique(appRoutes.map((route) => route.id)) &&
      unique(appRoutes.map((route) => route.path)),
  );
  for (const route of appRoutes) {
    assert.ok(
      navigationSections.some((section) => section.id === route.section),
      route.id,
    );
    assert.ok(
      route.path.startsWith("/") && !route.path.startsWith("/demo/"),
      route.id,
    );
    if (route.permission) {
      assert.match(
        route.permission,
        /^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/,
      );
      assert.equal(
        route.requiresMfa,
        route.permission.startsWith("SECURITY_ADMINISTRATION."),
        `${route.id}: security administration requires MFA`,
      );
    }
  }
});

// Updated in Stage 3: the security pages backed by real APIs are implemented;
// Security audit (no retrieval API) is still not.
test("only pages backed by a working backend contract are implemented; no placeholder screens", () => {
  assert.deepEqual(
    implementedRoutes.map((route) => route.path),
    [
      "/dashboard",
      // HR recruitment (session-only, owner-approved demo data until its backend exists).
      "/hr/recruitment/requisition",
      "/hr/recruitment/requisition/:requisitionId",
      "/hr/recruitment/interview",
      "/hr/recruitment/interview/:assessmentId",
      "/hr/recruitment/offer",
      "/hr/recruitment/offer/:offerId",
      "/security/users",
      "/security/users/:userId",
      "/security/roles",
      "/security/user-roles",
      "/security/user-roles/:userId",
      "/security/role-permissions",
      "/security/permission-catalog",
      "/security/permission-overrides",
      "/security/permission-overrides/:userId",
      "/account/password",
      "/account/authenticator",
    ],
  );
  assert.ok(
    implementedRoutes
      .filter((route) => route.section !== "security")
      .every((route) => !route.permission),
    "session-only pages",
  );
  assert.ok(
    implementedRoutes
      .filter((route) => route.section === "security")
      .every((route) => route.permission && route.requiresMfa),
    "guarded security pages",
  );
  assert.deepEqual(
    appRoutes.filter((item) => !item.implemented).map((route) => route.id),
    ["security-audit"],
  );
  for (const route of appRoutes.filter((item) => !item.implemented)) {
    assert.equal(routeAccess(route, ADMIN), "unavailable", route.id);
  }
});

test("findAppRoute matches exact paths, tolerating a trailing slash", () => {
  assert.equal(findAppRoute("/dashboard")?.id, "dashboard");
  assert.equal(findAppRoute("/dashboard/")?.id, "dashboard");
  assert.equal(findAppRoute("/security/users")?.id, "user-accounts");
  for (const path of ["/dashboards", "/demo/live-operations", "/", "", null])
    assert.equal(findAppRoute(path), null, String(path));
});

// ------------------------------------------------------------ route access

test("route access: default deny until permissions resolve, then exact permission plus MFA", () => {
  const [users] = securityRoutes;
  assert.equal(users.permission, PERMISSIONS.USER_ACCOUNTS_VIEW);
  assert.equal(routeAccess(users, LOADING), "pending");
  assert.equal(routeAccess(users, FAILED), "error");
  assert.equal(routeAccess(users, IDLE), "denied");
  assert.equal(routeAccess(users, undefined), "denied");
  assert.equal(
    routeAccess(users, { status: "ready" }),
    "denied",
    "no lookup function",
  );
  assert.equal(
    routeAccess(users, {
      status: "ready",
      mfaVerified: true,
      has: () => "yes",
    }),
    "denied",
    "only literal true grants",
  );
  assert.equal(routeAccess(users, EMPTY), "denied");
  assert.equal(routeAccess(users, EMPLOYEE), "denied");
  assert.equal(
    routeAccess(users, ready([PERMISSIONS.ROLES_VIEW])),
    "denied",
    "another permission does not grant it",
  );
  assert.equal(routeAccess(users, ADMIN_WITHOUT_MFA), "mfa_required");
  assert.equal(routeAccess(users, ADMIN), "allowed");
  assert.equal(
    routeAccess(null, ADMIN),
    "unavailable",
    "unknown route fails closed",
  );
});

test("session-only pages open for every signed-in user, whatever the permission state", () => {
  for (const route of implementedRoutes.filter((item) => !item.permission)) {
    for (const access of [ADMIN, EMPLOYEE, EMPTY, LOADING, FAILED, IDLE]) {
      assert.equal(
        canAccessRoute(route, access),
        true,
        `${route.id} ${access.status}`,
      );
    }
  }
});

// Stage 3: picker pages also need the permission of the list they read (`alsoRequires`).
test("each security page requires its own VIEW permission", () => {
  for (const route of securityRoutes) {
    assert.equal(
      canAccessRoute(
        route,
        ready([route.permission, ...(route.alsoRequires || [])]),
      ),
      true,
      route.id,
    );
    if (route.alsoRequires)
      assert.equal(
        canAccessRoute(route, ready([route.permission])),
        false,
        `${route.id} without ${route.alsoRequires}`,
      );
    const others = Object.values(PERMISSIONS).filter(
      (key) => key !== route.permission,
    );
    assert.equal(canAccessRoute(route, ready(others)), false, route.id);
  }
});

// ------------------------------------------------------------ sidebar

// Updated in Stage 3: administrators now also see the implemented security pages.
test("sidebar: current production navigation for administrators, employees and empty sets", () => {
  for (const access of [EMPLOYEE, EMPTY, LOADING, FAILED, ADMIN_WITHOUT_MFA]) {
    const sections = authorizedNavigation(access);
    assert.deepEqual(
      ids(sections),
      [
        "dashboard",
        "hr-requisition",
        "hr-interview",
        "hr-offer",
        "account-password",
        "account-authenticator",
      ],
      access.status,
    );
    assert.ok(
      sections.every((section) => section.items.length > 0),
      "no empty sections",
    );
  }
  assert.deepEqual(ids(authorizedNavigation(ADMIN)), [
    "dashboard",
    "hr-requisition",
    "hr-interview",
    "hr-offer",
    "user-accounts",
    "roles",
    "user-roles",
    "role-permissions",
    "permission-catalog",
    "permission-overrides",
    "account-password",
    "account-authenticator",
  ]);
});

test("sidebar: implemented security pages appear only with their permission and MFA", () => {
  const securityIds = (access) =>
    ids(
      authorizedNavigation(access, stage3Routes).filter(
        (section) => section.id === "security",
      ),
    );
  // Stage 3: detail pages (`nav: false`) are guarded but never listed.
  assert.deepEqual(
    securityIds(ADMIN),
    securityRoutes
      .filter((route) => route.nav !== false)
      .map((route) => route.id),
  );
  for (const access of [
    EMPLOYEE,
    EMPTY,
    LOADING,
    FAILED,
    IDLE,
    ADMIN_WITHOUT_MFA,
  ]) {
    assert.deepEqual(securityIds(access), [], access.status);
    assert.equal(
      authorizedNavigation(access, stage3Routes).some(
        (section) => section.id === "security",
      ),
      false,
      "section omitted",
    );
  }
  assert.deepEqual(
    securityIds(
      ready([PERMISSIONS.ROLES_VIEW, PERMISSIONS.SECURITY_AUDIT_VIEW]),
    ),
    ["roles", "security-audit"],
  );
});

test("sidebar source lists only authorized navigation; template demos only in the preview", async () => {
  const sidebar = await read("../src/components/layout/Sidebar.jsx");
  assert.match(sidebar, /const sections = authorizedNavigation\(access\)/);
  assert.match(
    sidebar,
    /const demoSections = templateDemosAvailable\(status\) \? orvexaNavigation\.filter/,
  );
  for (const branding of [
    "Orvexa home",
    ">Orvexa<",
    "Artificial Intelligence OS",
    "Orvexa pages",
    "brand-live",
  ]) {
    assert.equal(sidebar.includes(branding), false, branding);
  }
  assert.match(sidebar, /\{appConfig\.name\}/);
});

// ------------------------------------------------------------ command palette

test("command palette lists exactly the sidebar pages and cannot reach others", () => {
  for (const access of [
    ADMIN,
    EMPLOYEE,
    EMPTY,
    LOADING,
    FAILED,
    ADMIN_WITHOUT_MFA,
  ]) {
    const commands = paletteCommands(access, "authenticated", stage3Routes);
    assert.deepEqual(
      commands.map((item) => item.id),
      ids(authorizedNavigation(access, stage3Routes)),
      access.status,
    );
    for (const item of commands) {
      assert.equal(
        canAccessRoute(
          stage3Routes.find((route) => route.path === item.path),
          access,
        ),
        true,
        item.id,
      );
    }
  }
  assert.ok(
    !paletteCommands(EMPLOYEE, "authenticated", stage3Routes).some((item) =>
      item.path.startsWith("/security/"),
    ),
  );
});

test("command palette search filters the authorized list only", () => {
  const commands = paletteCommands(EMPLOYEE, "authenticated", stage3Routes);
  assert.deepEqual(
    searchCommands(commands, "roles"),
    [],
    "unauthorized pages are not searchable",
  );
  assert.deepEqual(
    searchCommands(commands, "  PASS ").map((item) => item.id),
    ["account-password"],
  );
  assert.deepEqual(
    searchCommands(commands, "my account").map((item) => item.id),
    ["account-password", "account-authenticator"],
  );
  assert.equal(searchCommands(commands, "").length, commands.length);
  assert.equal(
    searchCommands(paletteCommands(ADMIN, "authenticated", stage3Routes), "", 3)
      .length,
    3,
  );
});

test("command palette source uses the shared configuration, not the template navigation", async () => {
  const palette = await read("../src/components/layout/CommandPalette.jsx");
  assert.match(palette, /paletteCommands\(access, status\)/);
  assert.equal(
    /orvexaNavigation|getOrvexaRoute|ask AI|Command Intelligence/.test(palette),
    false,
  );
});

// ------------------------------------------------------------ demo isolation

test("template demo pages are searchable only in the development preview", () => {
  for (const status of [
    "authenticated",
    "guest",
    "loading",
    "error",
    "mfa_required",
    undefined,
  ]) {
    assert.equal(
      paletteCommands(ADMIN, status).some((item) =>
        item.path.startsWith("/demo/"),
      ),
      false,
      String(status),
    );
  }
  const preview = paletteCommands(IDLE, "preview");
  assert.equal(
    preview.filter((item) => item.path.startsWith("/demo/")).length,
    orvexaDemoRoutes.length,
  );
});

test("Ctrl+J no longer opens the demo console", async () => {
  const layout = await read("../src/layouts/AdminLayout.jsx");
  assert.equal(/key === 'j'|test-console|\/demo\//.test(layout), false);
  assert.match(layout, /key === 'k'/, "Ctrl/Cmd+K page search is kept");
});

test("application routes are guarded by the shared configuration; demos stay preview-only", async () => {
  const router = await read("../src/app/router.jsx");
  assert.match(router, /element: <AppRouteAccess \/>,\s*children: \[/);
  for (const route of implementedRoutes) {
    assert.ok(
      router.includes(
        `{ path: '${route.path.slice(1)}', handle: { routeId: '${route.id}' }, element:`,
      ),
      route.id,
    );
  }
  for (const route of appRoutes.filter((item) => !item.implemented)) {
    assert.equal(
      router.includes(`'${route.path.slice(1)}'`),
      false,
      `${route.id} is not routed before it exists`,
    );
  }
  const guards = await read("../src/routes/RouteGuards.jsx");
  assert.match(guards, /switch \(routeAccess\(route, access\)\)/);
  assert.match(guards, /case 'allowed': return <Outlet \/>/);
  assert.match(
    guards,
    /default: return <NotFoundPage \/>/,
    "unknown or unimplemented ids fail closed",
  );
});

// ------------------------------------------------------------ header and dashboard

test("the header has no sample notifications or unsupported account actions", async () => {
  const header = await read("../src/components/layout/Header.jsx");
  for (const fabricated of [
    "originalNotifications",
    "notification-count",
    "notification-dot",
    "need attention",
    "Provider latency",
    "approvals waiting",
    "Billing",
    "credits",
    "'Settings'",
    "Profile & account",
    "Ask AI",
    "Search Orvexa",
  ]) {
    assert.equal(header.includes(fabricated), false, fabricated);
  }
  assert.match(
    header,
    /authorizedNavigation\(access\)\.find\(\(section\) => section\.id === 'account'\)/,
  );
  assert.match(header, /onClick=\{handleSignOut\}/, "sign-out kept");
});

test("the workspace dashboard uses real identity data and labels its demo content", async () => {
  const dashboard = await read("../src/features/dashboard/DashboardPage.jsx");
  const home = await read("../src/features/dashboard/components/HomeView.jsx");
  const atlas = await read(
    "../src/features/dashboard/components/ModuleAtlas.jsx",
  );
  const meta = await read(
    "../src/features/dashboard/components/DashboardMeta.jsx",
  );
  const avatar = await read("../src/components/profile/ProfileAvatar.jsx");
  const model = await read("../src/features/dashboard/dashboardExperience.js");

  // The approved design includes illustrative business content, but the
  // signed-in identity remains real and Smart Access lists only pages the
  // account is actually authorized to open.
  assert.match(dashboard, /resolveProfile\(user, status\)/);
  assert.match(dashboard, /authorizedNavigation\(access\)/);
  assert.match(dashboard, /usePermissions\(\)/);
  assert.match(
    dashboard,
    /<HomeView[\s\S]*pages=\{pages\}[\s\S]*accessStatus=\{access\.status\}[\s\S]*onOpenPage=\{openPage\}/,
  );
  assert.match(home, /Workspace · Preview/);
  assert.match(home, /onClick=\{onOpenProfile\}/);
  assert.match(home, /hero-profile/);
  assert.match(home, /ProfileAvatar/);
  assert.match(home, /profile\?\.jobTitle/);
  assert.match(home, /profile\?\.department/);
  assert.match(home, /Employee \{profile\.employeeNumber\}/);
  assert.match(home, /profile\?\.email/);
  assert.match(
    dashboard,
    /<ProfileAvatar profile=\{profile\} className="zrv-ws-profile-avatar"/,
  );
  assert.match(avatar, /profileAvatarUrl\(profile\)/);
  assert.match(avatar, /onError=\{\(\) => setFailedSource\(source\)\}/);
  assert.match(avatar, /initialsOf\(displayName\(profile\)\)/);
  assert.match(home, /AUTHORIZED PAGES/);
  assert.match(home, /onOpenPage\(page\)/);
  assert.match(home, /page\.sectionLabel/);
  assert.match(home, /page\.type === "external"/);
  assert.equal(home.includes("Your access, in reach"), true);
  assert.equal(
    /HOME_STARTERS|rankPages|useDashboardUsage/.test(home + dashboard),
    false,
  );
  assert.equal(/onPreviewModule|onOpenFinder/.test(home), false);
  assert.match(home, /Demo workflow/i);
  assert.match(home, /Illustrative workflow pulse|Demo activity/);
  assert.match(model, /isPreview/);
  assert.equal(
    /CREDIT_|HR_FORM_DEFS|ANALYTICS_|APPROVAL_|ACTIVITY_ITEMS|searchWorkspace|rankPages/.test(
      model,
    ),
    false,
  );
  assert.match(dashboard, /Illustrative preview identity/);

  // Only the dashboard canvas and the Module Atlas remain. Deferred workflow
  // screens and their modals are removed until they are rebuilt.
  assert.match(dashboard, /ModuleAtlas/);
  assert.match(atlas, /filterModules/);
  assert.equal(atlas.includes("Live demo"), false);
  assert.equal(
    /CreditNoteView|HrFormView|ApprovalsView|AnalyticsView|ActivityView|SettingsView|WorkspaceFinder|DashboardSplash|DashboardLegacySections/.test(
      dashboard,
    ),
    false,
  );
  for (const removed of [
    "CreditNoteView.jsx",
    "HrFormView.jsx",
    "ApprovalsView.jsx",
    "AnalyticsView.jsx",
    "ActivityView.jsx",
    "SettingsView.jsx",
    "WorkspaceFinder.jsx",
    "DashboardSplash.jsx",
    "BookExplorer.jsx",
    "BusinessSpaces.jsx",
    "DashboardHero.jsx",
    "ProfilePanel.jsx",
    "QuickLinks.jsx",
    "SmartAccess.jsx",
    "WorkMomentum.jsx",
  ]) {
    await assert.rejects(
      read(`../src/features/dashboard/components/${removed}`),
      { code: "ENOENT" },
      removed,
    );
  }
  for (const removed of [
    "DashboardLegacySections.jsx",
    "dashboardModel.js",
    "useDashboardUsage.js",
  ]) {
    await assert.rejects(
      read(`../src/features/dashboard/${removed}`),
      { code: "ENOENT" },
      removed,
    );
  }

  // The legacy template dashboard and chart library stay gone.
  assert.equal(
    /TemplateDashboardPreview|templateDemosAvailable/.test(dashboard),
    false,
  );
  for (const removed of [
    "TemplateDashboardPreview.jsx",
    "DashboardCharts.jsx",
    "LiveRequests.jsx",
    "liveRequestData.js",
    "mountDashboardCharts.js",
  ]) {
    await assert.rejects(
      read(`../src/features/dashboard/${removed}`),
      { code: "ENOENT" },
      removed,
    );
  }
});

test("effective access summary groups real permissions without inventing values", () => {
  const grouped = groupPermissions([
    {
      moduleCode: "SECURITY_ADMINISTRATION",
      resourceCode: "ROLES",
      actionCode: "VIEW",
      viaRole: true,
      viaOverride: false,
    },
    {
      moduleCode: "PRODUCTION",
      resourceCode: "WORK_ORDERS",
      actionCode: "VIEW",
      viaRole: false,
      viaOverride: true,
    },
    {
      moduleCode: "SECURITY_ADMINISTRATION",
      resourceCode: "ROLES",
      actionCode: "CREATE",
      viaRole: true,
      viaOverride: false,
    },
  ]);
  assert.deepEqual(
    grouped.map((module) => module.label),
    ["Production", "Security administration"],
  );
  assert.deepEqual(
    grouped[1].resources[0].actions.map((action) => action.actionCode),
    ["CREATE", "VIEW"],
  );
  assert.deepEqual(groupPermissions([]), []);
  assert.equal(
    humanizeCode("USER_PERMISSION_OVERRIDES"),
    "User permission overrides",
  );
  assert.equal(humanizeCode(null), "");
  assert.equal(formatDateTime("not a date"), null);
  assert.equal(formatDateTime(null), null);
  assert.equal(typeof formatDateTime("2026-10-21T16:00:00.000Z"), "string");
});

test("access-denied copy reflects real permission checks", async () => {
  const pages = await read("../src/pages/PhasePages.jsx");
  assert.equal(
    pages.includes("once backend authentication and roles are integrated"),
    false,
  );
  assert.match(
    pages,
    /requires a sign-in verified with your authenticator app/,
  );
});
