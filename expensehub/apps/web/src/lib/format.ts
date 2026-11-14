// Display formatting. Times always in Asia/Riyadh (TRD §4.2); money with SAR prefix and
// tabular figures (UI-UX §1). Amounts arrive as 2-decimal strings (API §1) — never computed here.
export const DISPLAY_TZ = 'Asia/Riyadh';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: DISPLAY_TZ,
});

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: DISPLAY_TZ,
});

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const businessDate = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: DISPLAY_TZ,
});

/** Instant → business date "YYYY-MM-DD" in Riyadh (e.g. a ZATCA invoice timestamp). */
export function riyadhDate(at: Date | string = new Date()): string {
  return businessDate.format(typeof at === 'string' ? new Date(at) : at);
}

export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** Business date "YYYY-MM-DD" → "18 Oct 2026" (no time-zone shift). */
export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

/** "1840.00" → "SAR 1,840.00". Grouping is applied to the string, not via floats. */
export function formatSar(amount: string | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  const [whole = '0', fraction = '00'] = amount.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount.startsWith('-') ? '-' : ''}SAR ${grouped}.${fraction.padEnd(2, '0')}`;
}

/** 42 → "42s", 192 → "3m 12s", 7380 → "2h 3m", 90000 → "1d 1h". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "5 minutes ago", "in 3 hours", "yesterday". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return relative.format(0, 'second');
  if (abs < 2700) return relative.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 64800) return relative.format(Math.round(diffSeconds / 3600), 'hour');
  return relative.format(Math.round(diffSeconds / 86400), 'day');
}
