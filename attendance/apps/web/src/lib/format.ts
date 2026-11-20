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
