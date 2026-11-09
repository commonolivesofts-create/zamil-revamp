// App shell. The navigation is hidden and slides in when the pointer touches the left edge
// (or on keyboard focus / the menu button). It can be pinned open; the choice is remembered.
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileClock,
  GraduationCap,
  Grid3x3,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  PenSquare,
  Pin,
  PinOff,
  Plus,
  Settings2,
  Sun,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { ROLE_LABEL, type Me } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { hasRole, useAction, useGet } from '../lib/data';
import { fmtDateTime } from '../lib/format';
import { Avatar, Badge } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  tone?: 'warn';
}
export function navModel(me: Me): [string, NavItem[]][] {
  const hr = hasRole(me, 'HR_ADMIN');
  const g: [string, NavItem[]][] = [
    [
      'Workspace',
      [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/catalog', label: 'Training catalog', icon: BookOpen },
        { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      ],
    ],
    [
      'My learning',
      [
        { to: '/new', label: me.hasTeam || hr ? 'New request / nominate' : 'New request', icon: Plus },
        { to: '/requests', label: 'My requests', icon: ListChecks, count: me.counts.myOpen, tone: 'warn' },
        { to: '/skills', label: 'My skills', icon: Target },
        { to: '/assessments', label: 'Assessments', icon: GraduationCap, count: me.counts.examsOpen },
      ],
    ],
  ];
  const manage: NavItem[] = [];
  if (me.counts.approvals || me.isManager || hasRole(me, 'HR_ADMIN', 'HR_LEAD', 'FINANCE') || me.delegatedTo)
    manage.push({ to: '/approvals', label: 'Approvals', icon: Inbox, count: me.counts.approvals });
  if (me.hasTeam) manage.push({ to: '/team', label: 'Team skills', icon: Users });
  if (me.canEditJsm || hasRole(me, 'HR_ADMIN', 'HR_LEAD'))
    manage.push({ to: '/jsm', label: 'Job Skills Matrix', icon: Grid3x3, count: me.counts.profilesPending });
  if (manage.length) g.push(['Manage', manage]);
  if (me.isTrainer || hr)
    g.push([
      'Trainer',
      [
        { to: '/attendance', label: 'Attendance & marks', icon: ClipboardCheck },
        { to: '/exams', label: 'Exam builder', icon: PenSquare },
      ],
    ]);
  const admin: NavItem[] = [];
  if (hr)
    admin.push(
      { to: '/sessions', label: 'Sessions & schedule', icon: Layers },
      { to: '/setup', label: 'Setup', icon: Settings2 },
    );
  if (hr || hasRole(me, 'HR_LEAD', 'FINANCE') || me.hasTeam)
    admin.push({ to: '/reports', label: 'Reports', icon: BarChart3 });
  if (hr) admin.push({ to: '/audit', label: 'Audit log', icon: FileClock });
  if (admin.length) g.push([hr ? 'Administration' : 'Insight', admin]);
  return g;
}

const PIN_KEY = 'th.navPinned';
const readPin = () => {
  try {
    return localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
};

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const [pinned, setPinned] = useState(readPin);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const location = useLocation();
  const shown = pinned || open;

  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hideSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 280);
  };
  const togglePin = () => {
    const v = !pinned;
    setPinned(v);
    setOpen(false);
    try {
      localStorage.setItem(PIN_KEY, v ? '1' : '0');
    } catch {
      /* private mode */
    }
  };
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-dvh">
      {/* Edge hot zone + visible handle: touching the left edge reveals the navigation. */}
      {!pinned && (
        <div
          className="fixed inset-y-0 left-0 z-40 w-3"
          onMouseEnter={show}
          onMouseLeave={hideSoon}
          aria-hidden
          data-testid="nav-hotzone"
        >
          <div
            className={cn(
              'absolute left-1 top-1/2 h-16 w-1 -translate-y-1/2 rounded-full bg-mint/60 transition-opacity',
              shown && 'opacity-0',
            )}
          />
        </div>
      )}
      {open && !pinned && (
        <div
          className="fixed inset-0 z-40 bg-[#03140d]/10 lg:bg-transparent"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      <aside
        aria-label="Main navigation"
        data-open={shown}
        onMouseEnter={show}
        onMouseLeave={() => !pinned && hideSoon()}
        onFocus={show}
        onBlur={(e) => !pinned && !e.currentTarget.contains(e.relatedTarget as Node) && hideSoon()}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-brand-2 text-[#d7efe3] transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)]',
          shown ? 'translate-x-0' : '-translate-x-full',
          open && !pinned && 'shadow-pop',
        )}
      >
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <div className="grid size-9 place-items-center rounded-xl bg-mint/15 text-mint">
            <GraduationCap className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <b className="block text-[14px] font-bold text-white">TrainingHub</b>
            <small className="text-[10.5px] text-[#8fb9a6]">Zamil Plastic Industries</small>
          </div>
          <button
            onClick={togglePin}
            title={
              pinned ? 'Unpin — hide until the pointer touches the left edge' : 'Pin the navigation open'
            }
            aria-label={pinned ? 'Unpin navigation' : 'Pin navigation'}
            className="rounded-lg p-1.5 text-[#8fb9a6] hover:bg-white/10 hover:text-white"
          >
            {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 scroll-thin">
          {navModel(me).map(([label, items]) => (
            <div key={label} className="mt-3">
              <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f9a86]">
                {label}
              </div>
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[12.5px] font-medium transition',
                      isActive ? 'bg-mint/15 text-white' : 'text-[#c4e0d2] hover:bg-white/6 hover:text-white',
                    )
                  }
                >
                  <i.icon className="size-4 shrink-0 opacity-80" />
                  <span className="flex-1 truncate">{i.label}</span>
                  {!!i.count && (
                    <b
                      className={cn(
                        'rounded-full px-1.5 text-[10px]',
                        i.tone === 'warn' ? 'bg-[#f0b84f]/20 text-[#f7d08a]' : 'bg-mint/20 text-mint',
                      )}
                    >
                      {i.count}
                    </b>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/8 px-4 py-3 text-[10.5px] text-[#6f9a86]">
          Hover the left edge to open · <kbd className="rounded bg-white/10 px-1">Esc</kbd> to close
        </div>
      </aside>

      <div className={cn('transition-[padding] duration-300', pinned && 'lg:pl-64')}>
        <TopBar me={me} onMenu={() => (open ? setOpen(false) : show())} pinned={pinned} />
        <main className="w-full px-4 pb-16 pt-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ me, onMenu, pinned }: { me: Me; onMenu: () => void; pinned: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const [menu, setMenu] = useState<'bell' | 'user' | null>(null);
  const notes = useGet<{ id: number; text: string; link: string; createdAt: string; read: boolean }[]>(
    ['notifications'],
    menu === 'bell' ? '/notifications' : null,
  );
  const markAll = useAction(() => api.post('/notifications/read', {}), { invalidate: [['notifications']] });
  const logout = async () => {
    await api.post('/auth/logout');
    qc.clear();
    window.location.href = '/';
  };
  const flip = () => {
    const v = !dark;
    setDark(v);
    document.documentElement.dataset.theme = v ? 'dark' : 'light';
    try {
      localStorage.setItem('th.theme', v ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !(e.target as HTMLElement).closest('[data-menu]') && setMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);
  const role = me.roles.includes('HR_ADMIN')
    ? 'HR admin'
    : me.roles.includes('HR_LEAD')
      ? 'HR Lead'
      : me.isManager
        ? 'Manager'
        : 'Employee';

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6">
        <button
          onClick={onMenu}
          className={cn('rounded-lg p-2 text-muted hover:bg-hover', pinned && 'lg:hidden')}
          aria-label="Open navigation"
          data-testid="nav-menu"
        >
          <Menu className="size-[18px]" />
        </button>
        <NavLink to="/" className="flex items-center gap-2 font-bold">
          <span className="grid size-7 place-items-center rounded-lg bg-brand text-mint">
            <GraduationCap className="size-4" />
          </span>
          <span className="hidden text-[14px] sm:inline">TrainingHub</span>
        </NavLink>
        <div className="flex-1" />
        {me.delegatedTo && (
          <Badge tone="warn" className="hidden md:inline-flex">
            Approvals delegated to {me.delegatedTo.name} until {me.delegatedTo.until}
          </Badge>
        )}
        <div className="relative" data-menu>
          <button
            onClick={() => setMenu(menu === 'bell' ? null : 'bell')}
            className="relative rounded-lg p-2 text-muted hover:bg-hover"
            aria-label="Notifications"
          >
            <Bell className="size-[18px]" />
            {me.counts.unread > 0 && (
              <b className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[9px] text-white">
                {me.counts.unread}
              </b>
            )}
          </button>
          {menu === 'bell' && (
            <div className="absolute right-0 top-11 w-[340px] animate-pop rounded-2xl border border-line bg-surface shadow-pop">
              <div className="flex items-center border-b border-line-2 px-4 py-2.5">
                <b className="flex-1 text-[12.5px]">Notifications</b>
                <button
                  className="text-[11.5px] font-semibold text-req"
                  onClick={() => markAll.mutate(undefined)}
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto scroll-thin">
                {(notes.data ?? []).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setMenu(null);
                      void api
                        .post('/notifications/read', { id: n.id })
                        .then(() => qc.invalidateQueries({ queryKey: ['me'] }));
                      nav(n.link);
                    }}
                    className={cn(
                      'flex w-full gap-2.5 border-b border-line-2 px-4 py-2.5 text-left hover:bg-hover',
                      !n.read && 'bg-accent-soft/50',
                    )}
                  >
                    <i
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        n.read ? 'bg-transparent' : 'bg-req',
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block text-[12px]">{n.text}</span>
                      <small className="text-[10.5px] text-fine">{fmtDateTime(n.createdAt)}</small>
                    </span>
                  </button>
                ))}
                {notes.data && !notes.data.length && (
                  <p className="px-4 py-8 text-center text-[12px] text-muted">You are all caught up.</p>
                )}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={flip}
          className="rounded-lg p-2 text-muted hover:bg-hover"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>
        <div className="relative" data-menu>
          <button
            onClick={() => setMenu(menu === 'user' ? null : 'user')}
            className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-hover"
            aria-label="Account"
          >
            <Avatar name={me.fullName} id={me.personId} />
            <span className="hidden text-left leading-tight md:block">
              <b className="block text-[12px]">{me.fullName}</b>
              <small className="text-[10.5px] text-muted">
                {role} · {me.positionName ?? me.jobName ?? '—'}
              </small>
            </span>
          </button>
          {menu === 'user' && (
            <div className="absolute right-0 top-12 w-64 animate-pop rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
              <div className="px-3 py-2">
                <b className="block text-[12.5px]">{me.fullName}</b>
                <small className="text-[11px] text-muted">
                  #{me.personNumber} · {me.department ?? '—'}
                </small>
                {me.roles.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {me.roles.map((r) => (
                      <Badge key={r} tone="info">
                        {ROLE_LABEL[r]}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <NavLink
                to="/password"
                onClick={() => setMenu(null)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] hover:bg-hover"
              >
                <KeyRound className="size-4 text-muted" /> Change password
              </NavLink>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] hover:bg-hover"
              >
                <LogOut className="size-4 text-muted" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
