export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-GB', opts) : '—';
export const fmtDateY = (iso: string | null | undefined) => fmtDate(iso, { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }) : '—';
export const fmtRange = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);
export const sar = (n: number) => (n ? `SAR ${n.toLocaleString('en-US')}` : 'No cost');
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
