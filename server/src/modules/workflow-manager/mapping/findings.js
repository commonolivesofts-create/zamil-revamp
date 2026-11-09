/*
 * Validation findings shared by the M2 mapping contracts. A finding is a client-safe diagnostic:
 * `{ severity, code, path, message }`. ERROR findings make a configuration invalid; WARNING
 * findings are reported but do not. Publication blockers are a separate, frozen list consumed by
 * M6 governance; M2 only reports them and never changes a version's lifecycle state.
 */
export const SEVERITY = Object.freeze({ ERROR: 'ERROR', WARNING: 'WARNING' });

export function createFindings() {
  const items = [];
  const add = (severity) => (code, path, message) =>
    items.push(Object.freeze({ severity, code, path, message }));
  return {
    error: add(SEVERITY.ERROR),
    warning: add(SEVERITY.WARNING),
    hasErrors: () => items.some((item) => item.severity === SEVERITY.ERROR),
    list: () => Object.freeze(sortFindings(items)),
  };
}

/** Deterministic order: severity, then path, then code. */
export function sortFindings(items) {
  const rank = (item) => (item.severity === SEVERITY.ERROR ? 0 : 1);
  return [...items].sort(
    (a, b) =>
      rank(a) - rank(b) || compareCodePoints(a.path, b.path) || compareCodePoints(a.code, b.code),
  );
}

/** Frozen, de-duplicated, ordered publication blockers: `{ code, path }`. */
export function freezeBlockers(blockers) {
  const seen = new Map();
  for (const blocker of blockers) seen.set(`${blocker.code}\u0000${blocker.path}`, blocker);
  return Object.freeze(
    [...seen.values()]
      .sort((a, b) => compareCodePoints(a.code, b.code) || compareCodePoints(a.path, b.path))
      .map((blocker) => Object.freeze({ code: blocker.code, path: blocker.path })),
  );
}

/** Orders strings by Unicode code point (not UTF-16 code unit). */
export function compareCodePoints(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = left[i].codePointAt(0) - right[i].codePointAt(0);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}
