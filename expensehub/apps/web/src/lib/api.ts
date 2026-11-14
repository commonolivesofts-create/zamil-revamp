// API client: same-origin cookie session, CSRF header on every call, Zod-checked responses.
import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  errorEnvelopeSchema,
  type ErrorCode,
} from '@expensehub/shared';
import type { z } from 'zod';

export const API_BASE = '/api/v1';

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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Non-2xx statuses whose body is still a valid response (e.g. 503 from /health). */
  acceptStatuses?: number[];
}

export async function api<S extends z.ZodType>(
  path: string,
  schema: S,
  { method = 'GET', body, signal, acceptStatuses = [] }: RequestOptions = {},
): Promise<z.infer<S>> {
  // FormData (receipt upload): the browser sets the multipart boundary itself.
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
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
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError('NETWORK', 0, 'Cannot reach the ExpenseHub API');
  }

  // 204 No Content (delete) has no body.
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => undefined);

  if (!res.ok && !acceptStatuses.includes(res.status)) {
    const envelope = errorEnvelopeSchema.safeParse(data);
    if (envelope.success) {
      const { code, message, details } = envelope.data.error;
      throw new ApiError(code, res.status, message, details);
    }
    // No envelope: the proxy answered because the API itself is not running.
    throw new ApiError('NETWORK', res.status, 'Cannot reach the ExpenseHub API');
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError('BAD_RESPONSE', res.status, 'Unexpected response from the API');
  }
  return parsed.data;
}
