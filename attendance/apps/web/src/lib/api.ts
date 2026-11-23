// The one fetch wrapper: same-origin cookie session, CSRF header on every call, zod-checked
// responses, and the shared error envelope turned into ApiError.
import {
  API_BASE,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  errorEnvelopeSchema,
  type ErrorCode,
} from '@attendance/shared';
import type { z } from 'zod';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'BAD_RESPONSE';

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function send(path: string, { method = 'GET', body, signal }: RequestOptions) {
  // FormData (file upload): the browser sets the multipart boundary itself.
  const isForm = body instanceof FormData;
  try {
    return await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        [CSRF_HEADER]: CSRF_HEADER_VALUE,
        ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('NETWORK', 0, 'Cannot reach the attendance API.');
  }
}

async function failure(res: Response): Promise<ApiError> {
  const data: unknown = await res.json().catch(() => undefined);
  const envelope = errorEnvelopeSchema.safeParse(data);
  if (envelope.success) {
    const { code, message, details } = envelope.data.error;
    return new ApiError(code, res.status, message, details);
  }
  // No envelope: the dev proxy answered because the API is not running.
  return new ApiError('NETWORK', res.status, 'Cannot reach the attendance API.');
}

export async function api<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.infer<S>> {
  const res = await send(path, options);
  if (!res.ok) throw await failure(res);
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => undefined);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError('BAD_RESPONSE', res.status, 'Unexpected response from the API.');
  }
  return parsed.data;
}

/** POST returning a file (CSV export): resolves to the blob and the server's file name. */
export async function apiDownload(
  path: string,
  body: unknown,
): Promise<{ blob: Blob; fileName: string }> {
  const res = await send(path, { method: 'POST', body });
  if (!res.ok) throw await failure(res);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await res.blob(), fileName: match?.[1] ?? 'export.csv' };
}

/** Human message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
