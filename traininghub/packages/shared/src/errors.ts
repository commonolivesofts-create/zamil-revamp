export const ERROR_HTTP_STATUS = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  POLICY_BLOCK: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  FUSION_ERROR: 502,
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}
