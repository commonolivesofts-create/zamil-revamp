import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Category, Me, RoleCode, Skill } from '@traininghub/shared';
import { api, ApiError } from './api';

export interface Lookups {
  categories: Category[];
  skills: (Skill & { usedBy: number })[];
  positions: {
    id: number;
    name: string;
    grade: string | null;
    status: string;
    versionNo: number;
    ownerPersonId: number | null;
  }[];
  people: {
    personId: number;
    personNumber: string;
    fullName: string;
    positionId: number | null;
    managerId: number | null;
    jobName: string | null;
  }[];
  roles: RoleCode[];
}

export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/me');
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        // If no TrainingHub cookie exists, the API validates the HttpOnly Zamil cookie and issues
        // a bounded local session. A failed handoff leaves the existing local login flow available.
        try {
          return await api.post<Me>('/auth/sso');
        } catch (ssoError) {
          if (ssoError instanceof ApiError && ssoError.status === 401) throw error;
          throw ssoError;
        }
      }
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
export const useLookups = () =>
  useQuery({ queryKey: ['lookups'], queryFn: () => api.get<Lookups>('/lookups'), staleTime: 60_000 });
export function useGet<T>(
  key: QueryKey,
  url: string | null,
  opts: { refetchInterval?: number; staleTime?: number } = {},
) {
  return useQuery({ queryKey: key, queryFn: () => api.get<T>(url!), enabled: !!url, ...opts });
}

/** A mutation that toasts, invalidates everything relevant and surfaces API errors. */
export function useAction<V, R = unknown>(
  fn: (v: V) => Promise<R>,
  opts: {
    success?: string | ((r: R) => string);
    invalidate?: QueryKey[];
    onSuccess?: (r: R) => void;
    onError?: (e: ApiError) => void;
  } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) toast.success(msg);
      for (const k of opts.invalidate ?? [[]]) void qc.invalidateQueries({ queryKey: k });
      void qc.invalidateQueries({ queryKey: ['me'] });
      opts.onSuccess?.(r);
    },
    onError: (e) => {
      const err = e instanceof ApiError ? e : new ApiError(0, 'INTERNAL', String(e));
      if (opts.onError) opts.onError(err);
      else toast.error(err.message);
    },
  });
}

export const skillMap = (l?: Lookups) => new Map((l?.skills ?? []).map((s) => [s.id, s]));
export const catMap = (l?: Lookups) => new Map((l?.categories ?? []).map((c) => [c.id, c]));
export const personMap = (l?: Lookups) => new Map((l?.people ?? []).map((p) => [p.personId, p]));
export const hasRole = (me: Me | undefined, ...r: RoleCode[]) =>
  !!me && (me.roles.includes('SYS_ADMIN') || r.some((x) => me.roles.includes(x)));
