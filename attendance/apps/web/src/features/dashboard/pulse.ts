// Dashboard helpers shared by the widgets and the page (kept out of widgets.tsx so React fast
// refresh can treat that file as components only).
import { useEffect, useState } from 'react';
import type { Dashboard } from '@attendance/shared';

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from 0 to `target` (instant when motion is reduced). */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));
  useEffect(() => {
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(target * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/** Attendance rate of a processed day: present / (present + on leave + absent). */
export const dayRate = (r: Dashboard['trend'][number]) => {
  const scheduled = r.present + r.onLeave + r.absent;
  return scheduled === 0 ? 0 : (r.present / scheduled) * 100;
};
