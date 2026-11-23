import type { Tone } from '../../components/Badge';

const STATUS_TONES: Record<string, Tone> = { APPROVED: 'good', AWAITING: 'warn', DENIED: 'bad' };

/** Badge tone for an approval status (CI3: absence-status-approved / awaiting / denied). */
export function statusTone(status: string | null): Tone {
  return STATUS_TONES[(status ?? '').trim().toUpperCase()] ?? 'neutral';
}
