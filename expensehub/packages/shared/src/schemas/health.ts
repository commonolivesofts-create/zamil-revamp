// Implements: API §12 `GET /health` — no auth, no secrets.
// `dataMode` and `notifyTransport` extend the API.md shape for D-33.
import { z } from 'zod';
import { APP_ENVS, DATA_MODES, FUSION_MODES, NOTIFY_TRANSPORTS } from '../modes';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'error']),
  dataMode: z.enum(DATA_MODES),
  fusionMode: z.enum(FUSION_MODES),
  notifyTransport: z.enum(NOTIFY_TRANSPORTS),
  env: z.enum(APP_ENVS),
  version: z.string(),
  time: z.iso.datetime({ offset: true }),
  uptimeSeconds: z.number().int().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
