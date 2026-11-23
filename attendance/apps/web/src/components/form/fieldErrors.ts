export type FieldErrors = Record<string, string>;

/** Maps zod issues (client) or the API's `details.issues` to the first message per field. */
export function fieldErrorsFrom(issues: unknown): FieldErrors {
  if (!Array.isArray(issues)) return {};
  const errors: FieldErrors = {};
  for (const issue of issues as { path?: unknown; message?: unknown }[]) {
    const path = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? '');
    const field = path.split('.')[0];
    if (field && typeof issue.message === 'string' && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
