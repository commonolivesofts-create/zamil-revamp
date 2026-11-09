// UI-UX §3–4: one navigation model for the sidebar, bottom tabs and command menu.
// Items show only for users who hold a matching capability (no role switcher).
import { hasAnyCapability, isApprover, type Capability, type MeResponse } from '@expensehub/shared';
import {
  Activity,
  FileText,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Mail,
  Receipt,
  Route,
  ServerCog,
  Settings2,
  ShieldCheck,
  UserCheck,
  Wallet,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export type NavSection = 'claims' | 'work' | 'finance' | 'admin' | 'dev';
export type NavId =
  | 'home'
  | 'expenses'
  | 'reports'
  | 'status'
  | 'approvals'
  | 'audit'
  | 'payables'
  | 'quickPays'
  | 'setup'
  | 'prerequisites'
  | 'integrations'
  | 'systemStatus'
  | 'mail'
  | 'fusion';

export interface NavItem {
  id: NavId;
  to: string;
  icon: LucideIcon;
  section: NavSection;
  /** Any one of these; omitted = every signed-in user. */
  requires?: Capability[];
  /** Line managers and approval-step role holders. */
  approver?: boolean;
  /** Dev build + quick-login only (D-33). */
  dev?: boolean;
  /** Milestone that builds the screen; shown until then. */
  milestone?: string;
  /** Stays highlighted on sub-pages (e.g. /setup/options). */
  prefix?: boolean;
}

const FINANCE_OR_ADMIN: Capability[] = ['SYS_ADMIN', 'FINANCE_AP', 'ACCOUNTANT'];

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', to: '/', icon: LayoutDashboard, section: 'claims' },
  { id: 'expenses', to: '/expenses', icon: Receipt, section: 'claims', prefix: true },
  { id: 'reports', to: '/reports', icon: FileText, section: 'claims', prefix: true },
  { id: 'status', to: '/status', icon: Route, section: 'claims' },
  { id: 'approvals', to: '/approvals', icon: ListChecks, section: 'work', approver: true },
  {
    id: 'audit',
    to: '/audit',
    icon: ShieldCheck,
    section: 'work',
    requires: ['ACCOUNTANT'],
    prefix: true,
  },
  {
    id: 'payables',
    to: '/finance/payables',
    icon: Landmark,
    section: 'finance',
    requires: ['FINANCE_AP'],
  },
  {
    id: 'quickPays',
    to: '/finance/quick-pays',
    icon: Wallet,
    section: 'finance',
    requires: ['FINANCE_AP'],
  },
  {
    id: 'setup',
    to: '/setup',
    icon: Settings2,
    section: 'admin',
    requires: ['SYS_ADMIN'],
    prefix: true,
  },
  {
    id: 'prerequisites',
    to: '/admin/prerequisites',
    icon: UserCheck,
    section: 'admin',
    requires: FINANCE_OR_ADMIN,
  },
  {
    id: 'integrations',
    to: '/admin/integrations',
    icon: Workflow,
    section: 'admin',
    requires: FINANCE_OR_ADMIN,
  },
  {
    id: 'systemStatus',
    to: '/system/status',
    icon: Activity,
    section: 'admin',
    requires: ['SYS_ADMIN'],
  },
  // D-33: compiled out of production builds.
  ...(import.meta.env.DEV
    ? [
        { id: 'mail', to: '/dev/mail', icon: Mail, section: 'dev', dev: true } satisfies NavItem,
        // D-36 Fusion simulator.
        {
          id: 'fusion',
          to: '/dev/fusion',
          icon: ServerCog,
          section: 'dev',
          dev: true,
        } satisfies NavItem,
      ]
    : []),
];

export const SECTION_ORDER: NavSection[] = ['claims', 'work', 'finance', 'admin', 'dev'];

export function canSee(
  item: Pick<NavItem, 'requires' | 'approver' | 'dev'>,
  me: Pick<MeResponse, 'capabilities'>,
  devTools: boolean,
): boolean {
  if (item.dev && !devTools) return false;
  if (item.approver && !isApprover(me.capabilities)) return false;
  if (item.requires && !hasAnyCapability(me.capabilities, item.requires)) return false;
  return true;
}

export function visibleNav(me: Pick<MeResponse, 'capabilities'>, devTools: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => canSee(item, me, devTools));
}

export function navItem(id: NavId): NavItem {
  const item = NAV_ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`Unknown nav item ${id}`);
  return item;
}
