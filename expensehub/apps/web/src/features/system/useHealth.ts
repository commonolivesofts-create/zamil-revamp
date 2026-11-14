// Implements: API §12 health, polled for the status page.
import { healthResponseSchema, type HealthResponse } from '@expensehub/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const HEALTH_REFRESH_MS = 15_000;

export interface HealthSnapshot extends HealthResponse {
  latencyMs: number;
  checkedAt: Date;
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async ({ signal }): Promise<HealthSnapshot> => {
      const started = performance.now();
      // 503 still carries a health body (degraded data store).
      const data = await api('/health', healthResponseSchema, { signal, acceptStatuses: [503] });
      return { ...data, latencyMs: Math.round(performance.now() - started), checkedAt: new Date() };
    },
    refetchInterval: HEALTH_REFRESH_MS,
    // The poll is the retry; report an outage at once instead of after back-off.
    retry: false,
  });
}
