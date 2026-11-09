// Deterministic animation helpers: every value is a pure function of time t (seconds), so the
// headless renderer can draw any frame in any order and get the same picture.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;

export const ease = {
  linear: (k) => k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  in: (k) => k * k * k,
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: (k) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
};

/** 0→1 progress between t0 and t1 (eased). */
export function prog(t, t0, t1, fn = ease.out) {
  if (t1 <= t0) return t >= t1 ? 1 : 0;
  return fn(clamp((t - t0) / (t1 - t0)));
}

/** Value that goes from a to b between t0 and t1. */
export const tween = (t, t0, t1, a, b, fn = ease.out) => lerp(a, b, prog(t, t0, t1, fn));

/** Appear: opacity + slide up, from t0 over d seconds. */
export function appear(el, t, t0, d = 0.45, dy = 18) {
  const k = prog(t, t0, t0 + d);
  el.style.opacity = String(k);
  el.style.transform = `translateY(${(1 - k) * dy}px)`;
  return k;
}

/** Pop: scale in with overshoot. */
export function pop(el, t, t0, d = 0.4) {
  const k = prog(t, t0, t0 + d, ease.back);
  el.style.opacity = String(clamp(k * 1.5));
  el.style.transform = `scale(${0.85 + 0.15 * k})`;
  return k;
}

/** Typewriter: the first n characters of text at time t (cps characters per second). */
export function typed(text, t, t0, cps = 18) {
  if (t < t0) return '';
  return text.slice(0, Math.floor((t - t0) * cps));
}

/** Count up a number (rendered by fmt) between t0 and t1. */
export function countUp(t, t0, t1, from, to, fmt = (v) => v.toFixed(0)) {
  return fmt(tween(t, t0, t1, from, to));
}

/** "SAR 1,234.50" */
export function sar(v) {
  return `SAR ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Cursor path: keys = [[time, x, y, click?], …]. Returns {x, y, clickAge} where clickAge is the
 * seconds since the last click (for the ripple), or Infinity.
 */
export function cursorAt(keys, t) {
  let x = keys[0][1];
  let y = keys[0][2];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, x0, y0] = keys[i];
    const [t1, x1, y1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const k = ease.inOut(clamp((t - t0) / Math.max(0.001, t1 - t0)));
      x = lerp(x0, x1, k);
      y = lerp(y0, y1, k);
      break;
    }
    if (t > t1) {
      x = x1;
      y = y1;
    }
  }
  let clickAge = Infinity;
  for (const [tk, , , click] of keys) if (click && t >= tk) clickAge = t - tk;
  return { x, y, clickAge };
}

/** Scene-local time windows: on(t, a, b) is true for a <= t < b. */
export const on = (t, a, b = Infinity) => t >= a && t < b;
