// Field-level difference between two JSON snapshots (setup history, FR-SET-05).
export interface FieldChange {
  key: string;
  from: unknown;
  to: unknown;
}

export function changedFields(item: { oldJson: unknown; newJson: unknown }): FieldChange[] {
  const before = (item.oldJson ?? {}) as Record<string, unknown>;
  const after = (item.newJson ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ key, from: before[key], to: after[key] }));
}
