// ACTIVE/INACTIVE and Y/N badges (CI3: shift-status-badge status-active / status-inactive).
import { Badge } from './Badge';

export function StatusBadge({ status }: { status: string | null }) {
  const value = (status ?? '').trim().toUpperCase();
  if (!value) return <>—</>;
  return <Badge tone={value === 'ACTIVE' ? 'good' : 'neutral'}>{(status ?? '').trim()}</Badge>;
}

export function YesNoBadge({ value }: { value: string | null }) {
  const flag = (value ?? '').trim().toUpperCase();
  if (flag === 'Y') return <Badge tone="good">Yes</Badge>;
  if (flag === 'N') return <Badge tone="neutral">No</Badge>;
  return <>{flag || '—'}</>;
}
