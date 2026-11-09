// Route guards. The API enforces every rule again; these only decide what to render.
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../../features/auth/hooks';
import { ForbiddenPage } from '../../features/errors/ForbiddenPage';
import {
  CurrentUserContext,
  devToolsEnabled,
  isSigningOut,
  useCurrentUser,
} from '../../lib/session';
import { canSee, navItem, type NavId } from '../shell/navigation';
import { Logo } from '../brand/Logo';
import { Spinner } from '../ui/Spinner';
import { LoginPage } from '../../features/auth/LoginPage';

export function RequireAuth() {
  const { t } = useTranslation();
  const me = useMe();
  const location = useLocation();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (me.data) wasSignedIn.current = true;
  }, [me.data]);

  if (me.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas" aria-busy="true">
        <div className="flex flex-col items-center gap-4 text-muted">
          <Logo />
          <Spinner className="size-5" />
          <span className="sr-only">{t('app.loading')}</span>
        </div>
      </div>
    );
  }

  if (me.isError) {
    return <LoginPage ssoNotice={me.error.message} />;
  }

  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    const expired = wasSignedIn.current && !isSigningOut() ? '&expired=1' : '';
    return <Navigate to={`/login?next=${next}${expired}`} replace />;
  }

  return (
    <CurrentUserContext.Provider value={me.data}>
      <Outlet />
    </CurrentUserContext.Provider>
  );
}

/** Renders the page only for users allowed to see its nav item; otherwise 403. */
export function RequireNav({ id, children }: { id: NavId; children: ReactNode }) {
  const me = useCurrentUser();
  return canSee(navItem(id), me, devToolsEnabled(me)) ? children : <ForbiddenPage />;
}
