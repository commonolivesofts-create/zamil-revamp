// Status badge (client AdminUi Badge markup; tones from security-admin.css).
import type { ReactNode } from 'react';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`zrv-admin-badge zrv-admin-badge--${tone}`}>{children}</span>;
}
