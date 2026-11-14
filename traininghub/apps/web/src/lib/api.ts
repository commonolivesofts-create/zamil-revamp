import type { ApiErrorBody, ErrorCode } from '@traininghub/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
  /** Field messages from a validation error, flattened to strings. */
  get fields(): Record<string, string> {
    const f = (this.details as { fields?: Record<string, string | string[]> } | undefined)?.fields ?? {};
    return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Array.isArray(v) ? v.join(' ') : v]));
  }
  get list(): string[] {
    const f = (this.details as { fields?: { errors?: string[] } } | undefined)?.fields;
    return f?.errors ?? [];
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${url}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'TrainingHub',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the TrainingHub server');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const e = (data as ApiErrorBody | undefined)?.error;
    const err = new ApiError(
      res.status,
      e?.code ?? 'INTERNAL',
      e?.message ?? `HTTP ${res.status}`,
      e?.details,
    );
    // /me is the auth query itself; invalidating it from inside its own request can restart
    // authentication repeatedly. Other protected requests refresh the cached user normally.
    if (res.status === 401 && !url.startsWith('/auth/') && url !== '/me')
      window.dispatchEvent(new CustomEvent('th:unauthenticated'));
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => call<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => call<T>('POST', url, body),
  put: <T>(url: string, body: unknown = {}) => call<T>('PUT', url, body),
  del: <T>(url: string) => call<T>('DELETE', url),
};
