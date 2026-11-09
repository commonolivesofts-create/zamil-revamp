// Puts API VALIDATION issues ({ issues: [{ path, message }] }) onto react-hook-form fields.
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/** Returns true when every issue landed on a field (so no extra toast is needed). */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): boolean {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION') return false;
  const issues = (error.details as { issues?: { path: string; message: string }[] } | undefined)
    ?.issues;
  if (!issues?.length) return false;
  let allPlaced = true;
  for (const issue of issues) {
    if (fields.includes(issue.path)) {
      setError(issue.path as Path<T>, { type: 'server', message: issue.message });
    } else {
      allPlaced = false;
    }
  }
  return allPlaced;
}
