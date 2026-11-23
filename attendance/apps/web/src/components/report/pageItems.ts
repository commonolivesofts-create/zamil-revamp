/** Page numbers around the current one, with gaps toward the ends. */
export function pageItems(current: number, total: number): (number | 'gap-start' | 'gap-end')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(current - 1, total - 4));
  const end = Math.min(total - 1, Math.max(current + 1, 5));
  const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return [
    1,
    ...(start > 2 ? ['gap-start' as const] : []),
    ...middle,
    ...(end < total - 1 ? ['gap-end' as const] : []),
    total,
  ];
}
