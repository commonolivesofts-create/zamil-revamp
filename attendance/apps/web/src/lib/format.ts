// Display formatting shared by every page.

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** '2024-03-01' -> '01 Mar 2024'; anything else is shown as stored. */
export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return DATE_FORMAT.format(new Date(Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!)));
}

/** Empty values render as an em dash. */
export function display(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function formatCount(value: number): string {
  return value.toLocaleString('en');
}

/** '2026-11-20 14:30:05' -> '20 Nov 2026, 02:30 PM' (CI3 "d M Y, h:i A"). */
export function formatDateTime(value: string | null | undefined): string {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(value ?? '');
  if (!match) return value || '—';
  const hours = Number(match[2]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const h12 = String(hours % 12 || 12).padStart(2, '0');
  return `${formatIsoDate(match[1])}, ${h12}:${match[3]} ${suffix}`;
}
