// Implements: API §1 error codes. One list for API and web.
// INTERNAL and RATE_LIMITED are additions to the API.md list (unexpected errors, login rate limit).

export const ERROR_HTTP_STATUS = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  SOD_VIOLATION: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  VERSION_CONFLICT: 409,
  POLICY_BLOCK: 422,
  PREREQUISITE_MISSING: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  FUSION_ERROR: 502,
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;

export const ERROR_CODES = Object.keys(ERROR_HTTP_STATUS) as [ErrorCode, ...ErrorCode[]];
