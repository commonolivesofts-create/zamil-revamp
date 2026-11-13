
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { useNavigate, useSearchParams } from "react-router";

import { authorizedNavigation } from "@/config/appNavigation.js";
import useAuth from "@/features/auth/useAuth.js";
import usePermissions from "@/features/access/usePermissions.js";

import HomeView from "@/features/dashboard/components/HomeView.jsx";
import ModuleAtlas from "@/features/dashboard/components/ModuleAtlas.jsx";

import { resolveProfile } from "@/features/dashboard/dashboardExperience.js";

import {
  useRevealOnScroll,
  useScrollProgress,
  shouldReduceMotion,
} from "@/features/dashboard/useDashboardMotion.js";


import useNavigationReveal from "@/components/navigation/useNavigationReveal.js";


import "@/styles/dashboard-workspace.css";

// The shell owns the sidebar, header, command palette and layout customizer.
// This page is the workspace canvas: the home overview and the Module Atlas.
//
// HR form shortcuts use the existing authorized navigation registry.
// Clicking an HR shortcut reveals its corresponding sidebar navigation item
// without immediately leaving the dashboard.
const RIPPLE_TARGETS =
  ".gateway-action, .quick-form, .domain-card, .book-leaf-open";

export default function DashboardPage() {
  const { user, status } = useAuth();
  const access = usePermissions();

  const navigate = useNavigate();

  // Shared sidebar reveal mechanism.
  const { revealNavigationItem } = useNavigationReveal();

  const [searchParams, setSearchParams] = useSearchParams();

  const view =
    searchParams.get("view") === "atlas"
      ? "atlas"
      : "home";

  const atlasDomain =
    view === "atlas"
      ? (searchParams.get("domain") ?? "")
      : "";

  const profile = useMemo(
    () => resolveProfile(user, status),
    [user, status],
  );

  // Preserve the existing permission-filtered navigation.
  // This is the single source of truth for available pages.
  const pages = useMemo(
    () =>
      authorizedNavigation(access).flatMap((section) =>
        section.items.map((page) => ({
          ...page,
          sectionLabel: section.label,
        })),
      ),
    [access],
  );

  const rootRef = useRef(null);

  const motionEnabled = useRevealOnScroll(rootRef, view);

  const progressRef = useScrollProgress(
    motionEnabled,
    view,
  );

  const lastViewRef = useRef(view);

  // Preserve the existing dashboard scroll restoration.
  useLayoutEffect(() => {
    const previousRestoration =
      window.history.scrollRestoration;

    window.history.scrollRestoration = "manual";

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    return () => {
      window.history.scrollRestoration =
        previousRestoration;
    };
  }, []);

  // Preserve the existing dashboard home / Module Atlas navigation.
  const navigateView = useCallback(
    (nextView, options = {}) => {
      const normalized =
        nextView === "atlas"
          ? "atlas"
          : nextView === "home"
            ? "home"
            : null;

      if (!normalized) return;

      const params = new URLSearchParams();

      if (normalized === "atlas") {
        params.set("view", "atlas");

        if (options.domain) {
          params.set("domain", options.domain);
        }
      }

      setSearchParams(params, {
        replace: false,
      });
    },
    [setSearchParams],
  );

  // Preserve existing direct page navigation.
  // This remains available for non-HR dashboard actions.
  const openPage = useCallback(
    (page) => {
      if (!page) return;

      if (page.type === "external") {
        window.open(
          page.href,
          "_blank",
          "noopener,noreferrer",
        );

        return;
      }

      if (!page.path) return;

      navigate(page.path);
    },
    [navigate],
  );

  // NEW: Reveal an authorized HR form in the existing sidebar.
  //
  // Behavior:
  // 1. Validate that the clicked page belongs to the authorized list.
  // 2. Confirm it is an internal HR navigation item.
  // 3. Request the shared sidebar to reveal the form.
  // 4. Keep the dashboard visible without navigating away.
  //
  // The sidebar resolves the parent section and subgroup from
  // its existing navigation registry, preserving DRY architecture.
  const revealHrPage = useCallback(
    (page) => {
      if (!page?.id) return;

      // Do not process a reveal while permissions are unresolved.
      if (access.status !== "ready") return;

      const authorizedPage = pages.find(
        (item) =>
          item.id === page.id &&
          item.section === "human-resources" &&
          item.type !== "external" &&
          item.nav !== false &&
          item.implemented !== false &&
          Boolean(item.path),
      );

      if (!authorizedPage) return;

      // Do not navigate.
      // The existing sidebar will expand and reveal this route.
      revealNavigationItem(authorizedPage.id);
    },
    [
      pages,
      access.status,
      revealNavigationItem,
    ],
  );

  // Preserve focus restoration and scroll handling
  // when switching between dashboard and Module Atlas.
  useEffect(() => {
    if (lastViewRef.current === view) {
      return undefined;
    }

    lastViewRef.current = view;

    window.scrollTo({
      top: 0,
      behavior: "auto",
    });

    const frame = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector("[data-zrv-view-title]")
        ?.focus?.({
          preventScroll: true,
        });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [view]);

  // Preserve the existing dashboard ripple animation.
  const spawnRipple = useCallback((event) => {
    if (shouldReduceMotion()) return;

    const target = event.target.closest?.(
      RIPPLE_TARGETS,
    );

    if (!target) return;

    const bounds = target.getBoundingClientRect();

    const ripple = document.createElement("span");

    ripple.className = "click-energy";

    ripple.style.left =
      `${event.clientX - bounds.left}px`;

    ripple.style.top =
      `${event.clientY - bounds.top}px`;

    target.appendChild(ripple);

    ripple.addEventListener(
      "animationend",
      () => ripple.remove(),
      {
        once: true,
      },
    );
  }, []);

  // Preserve the existing dashboard view selection.
  // Only add the new HR reveal callback to HomeView.
  const content =
    view === "atlas" ? (
      <ModuleAtlas
        initialDomain={atlasDomain}
        onBack={() => navigateView("home")}
      />
    ) : (
      <HomeView
        profile={profile}
        pages={pages}
        accessStatus={access.status}
        onNavigate={navigateView}
        onOpenPage={openPage}
        onRevealHrPage={revealHrPage}
      />
    );

  return (
    <div
      className="zrv-ws"
      ref={rootRef}
      onPointerDown={spawnRipple}
    >
      <div
        className="scroll-indicator"
        ref={progressRef}
        aria-hidden="true"
      />

      <div
        className={`scene${
          view === "atlas"
            ? " atlas-no-enter"
            : ""
        }`}
        key={`${
          view
        }-${
          view === "atlas"
            ? atlasDomain
            : ""
        }`}
      >
        {content}
      </div>
    </div>
  );
}
