import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { REQUEST_STATUS_LABEL, type RequestStatus, type Requirement } from '@traininghub/shared';
import { cn } from '../lib/cn';
import { initials } from '../lib/format';
import { ReportPager } from './ReportPager';

/* ------------------------------ Button ------------------------------ */
type Variant = 'primary' | 'default' | 'ghost' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-solid text-brand-fg hover:bg-brand-solid-hover border-transparent shadow-sm',
  default: 'bg-surface border-line hover:bg-hover',
  ghost: 'bg-transparent border-transparent hover:bg-hover',
  danger: 'bg-bad text-white border-transparent hover:brightness-95',
  soft: 'bg-accent-soft text-brand-text border-transparent hover:brightness-97',
};
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: 'sm' | 'md';
    loading?: boolean;
    icon?: ReactNode;
  }
>(function Button(
  { variant = 'default', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-[11.5px]' : 'h-9 px-3.5 text-[12.5px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

/* ------------------------------ Layout ------------------------------ */
export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-card border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}
export function CardHead({
  title,
  sub,
  actions,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 border-b border-line-2 px-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-bold tracking-tight">{title}</h3>
        {sub && <p className="mt-0.5 text-[11.5px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  breadcrumb,
  title,
  sub,
  actions,
  animatedTitle = false,
}: {
  eyebrow?: string;
  breadcrumb?: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  animatedTitle?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        {breadcrumb && (
          <nav className="th-page-breadcrumb" aria-label="Breadcrumb">
            {breadcrumb}
            <span aria-hidden="true"> / </span>
            {title}
          </nav>
        )}
        {eyebrow && (
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-req">{eyebrow}</div>
        )}
        <h1
          className={`text-[20px] font-bold tracking-tight${animatedTitle ? ' th-page-title--animated' : ''}`}
          aria-label={animatedTitle ? title : undefined}
        >
          {animatedTitle
            ? [...title].map((character, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  style={{ '--th-title-index': index } as React.CSSProperties}
                >
                  {character === ' ' ? '\u00a0' : character}
                </span>
              ))
            : title}
        </h1>
        {sub && <p className="mt-1 max-w-3xl text-[12.5px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && (
        <div className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-req">{icon}</div>
      )}
      <b className="text-[13px]">{title}</b>
      {children && <div className="max-w-md text-[12px] text-muted">{children}</div>}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('th-skeleton', className)} />;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="th-content-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-3.5 w-2/3" />
      <div className="th-content-skeleton__rows">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function StartupLoading() {
  return (
    <div className="th-startup-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading application</span>
      <div className="th-startup-loading__visual" aria-hidden="true">
        <span className="th-startup-loading__brand">Zamil Digitalization</span>
        <span className="th-startup-loading__track" />
      </div>
    </div>
  );
}
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'ok';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = {
    info: 'bg-und-bg text-und-ink border-und/20',
    warn: 'bg-opt-bg text-opt-ink border-opt/25',
    bad: 'bg-bad-bg text-bad border-bad/25',
    ok: 'bg-req-bg text-req-ink border-req/25',
  }[tone];
  const Icon = tone === 'ok' ? Check : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cn('flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12px]', t, className)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">
        {title && <b className="block">{title}</b>}
        {children}
      </div>
    </div>
  );
}
export function Kpi({
  label,
  value,
  sub,
  tone,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'bad' | 'ok';
  loading?: boolean;
}) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[11px] font-semibold text-muted">{label}</div>
      <div
        className={cn(
          'mt-1 text-[22px] font-bold tracking-tight tabular',
          tone === 'bad' && 'text-bad',
          tone === 'ok' && 'text-req',
        )}
      >
        {loading ? <Skeleton className="h-7 w-16" /> : value}
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-3 w-24" />
      ) : (
        sub && <div className="mt-0.5 text-[11px] text-fine">{sub}</div>
      )}
    </Card>
  );
}

/* ------------------------------ Badges & chips ------------------------------ */
export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'info' | 'bad';
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const t = {
    neutral: 'bg-na-bg text-muted',
    ok: 'bg-req-bg text-req-ink',
    warn: 'bg-opt-bg text-opt-ink',
    info: 'bg-und-bg text-und-ink',
    bad: 'bg-bad-bg text-bad',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold',
        t,
        className,
      )}
    >
      {dot && <i className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
const STATUS_TONE: Record<RequestStatus, 'neutral' | 'ok' | 'warn' | 'info' | 'bad'> = {
  PENDING: 'warn',
  APPROVED: 'ok',
  WAITLISTED: 'info',
  REJECTED: 'bad',
  WITHDRAWN: 'neutral',
  ATTENDED: 'info',
  NO_SHOW: 'bad',
  COMPLETED: 'ok',
  NOT_PASSED: 'bad',
};
export const StatusChip = ({ status }: { status: RequestStatus }) => (
  <Badge tone={STATUS_TONE[status]} dot>
    {REQUEST_STATUS_LABEL[status]}
  </Badge>
);
export function ReqChip({
  r,
  level,
  critical,
}: {
  r: Requirement | null;
  level?: number;
  critical?: boolean;
}) {
  if (!r)
    return (
      <span className="inline-grid h-6 min-w-9 place-items-center rounded-md bg-na-bg px-1.5 text-[10.5px] font-bold text-na">
        —
      </span>
    );
  const t = { R: 'bg-req-bg text-req-ink', O: 'bg-opt-bg text-opt-ink', U: 'bg-und-bg text-und-ink' }[r];
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-9 items-center justify-center gap-0.5 rounded-md px-1.5 text-[10.5px] font-bold tabular',
        t,
      )}
    >
      {critical && '★'}
      {r}
      {level != null && level > 0 ? level : ''}
    </span>
  );
}
const AV = [
  'bg-[#d7f2e4] text-[#0b5c3f]',
  'bg-[#e6defb] text-[#4b2fa0]',
  'bg-[#dceafa] text-[#1f5394]',
  'bg-[#fbecd2] text-[#8a5a06]',
  'bg-[#fbdde6] text-[#952a4f]',
];
export function Avatar({
  name,
  id,
  size = 'sm',
}: {
  name: string;
  id: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const s = {
    xs: 'size-6 text-[9.5px]',
    sm: 'size-7 text-[10.5px]',
    md: 'size-9 text-[12px]',
    lg: 'size-12 text-[15px]',
  }[size];
  return (
    <span
      title={name}
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-bold', s, AV[id % 5])}
    >
      {initials(name)}
    </span>
  );
}
export function LevelBar({ current, target }: { current: number; target: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Level ${current} of ${target}`}>
      {[1, 2, 3, 4].map((l) => (
        <i
          key={l}
          className={cn(
            'h-2 w-3.5 rounded-sm',
            l <= current ? (current >= target ? 'bg-req' : 'bg-opt') : l <= target ? 'bg-bad/25' : 'bg-na-bg',
          )}
        />
      ))}
    </span>
  );
}
export function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-na-bg', className)}>
      <div
        className={cn('h-full rounded-full', value >= 85 ? 'bg-req' : value >= 60 ? 'bg-opt' : 'bg-bad')}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

/* ------------------------------ Forms ------------------------------ */
export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-[11.5px] font-semibold text-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] font-semibold text-bad">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-fine">{hint}</span>
      ) : null}
    </label>
  );
}
const inputCls =
  'w-full rounded-[9px] border border-line bg-surface px-2.5 py-2 text-[12.5px] outline-none transition placeholder:text-fine focus:border-req focus:ring-2 focus:ring-req/15 aria-[invalid=true]:border-bad';
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...p }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputCls, className)} {...p} />;
});
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, ...p }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(inputCls, 'pr-7', className)}
      {...p}
    />
  );
});
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...p }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(inputCls, 'min-h-20 resize-y', className)}
      {...p}
    />
  );
});
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50',
        checked ? 'bg-req' : 'bg-line',
      )}
    >
      <i
        className={cn(
          'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
          checked ? 'left-[18px]' : 'left-0.5',
        )}
      />
    </button>
  );
}
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[8px] font-semibold transition',
            size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-[12px]',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
export function Tabs<T extends string>({
  value,
  tabs,
  onChange,
}: {
  value: T;
  tabs: { value: T; label: ReactNode; count?: number }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line scroll-thin" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[12.5px] font-semibold transition',
            t.value === value ? 'border-req text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className="rounded-full bg-opt-bg px-1.5 text-[10px] font-bold text-opt-ink">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------ */
export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  wide,
  drawer = false,
  aboveDrawer = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  drawer?: boolean;
  aboveDrawer?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]',
            drawer && 'th-drawer-overlay',
            aboveDrawer && 'z-[70]',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 animate-pop flex-col rounded-[18px] border border-line bg-surface shadow-pop',
            wide ? 'max-w-3xl' : 'max-w-lg',
            drawer && 'th-drawer-content',
            aboveDrawer && 'z-[71]',
          )}
        >
          <div className="flex items-start gap-3 border-b border-line-2 px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[15px] font-bold">{title}</Dialog.Title>
              {sub ? (
                <Dialog.Description className="mt-0.5 text-[12px] text-muted">{sub}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">Dialog</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded-lg p-1 text-muted hover:bg-hover" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line-2 px-5 py-3">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------ Table ------------------------------ */
export function Table({
  head,
  children,
  className,
  pageSize,
  pagerLabel,
}: {
  head: ReactNode[];
  children: ReactNode;
  className?: string;
  pageSize?: number;
  pagerLabel?: string;
}) {
  const [page, setPage] = useState(1);
  const rows = Array.isArray(children)
    ? children.filter((child) => child != null && typeof child !== 'boolean')
    : children == null
      ? []
      : [children];
  const pages = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  const currentPage = Math.min(page, pages);
  const visibleRows = pageSize ? rows.slice((currentPage - 1) * pageSize, currentPage * pageSize) : rows;
  return (
    <div className={cn('th-report-table', className)}>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-wide text-fine">
              {head.map((h, i) => (
                <th key={i} className="whitespace-nowrap px-4 py-2.5 font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-line-2 [&>tr:last-child]:border-0 [&_td]:px-4 [&_td]:py-2.5">
            {visibleRows}
          </tbody>
        </table>
      </div>
      {pageSize && rows.length > 0 && (
        <ReportPager
          page={currentPage}
          pages={pages}
          total={rows.length}
          pageSize={pageSize}
          onPage={setPage}
          label={pagerLabel}
        />
      )}
    </div>
  );
}
