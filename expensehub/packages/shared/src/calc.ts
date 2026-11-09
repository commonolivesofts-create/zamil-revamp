// Implements: PRD §6 calculations, FR-CAP-05/06/07 — exact decimal arithmetic (BigInt), no floats.
// Rounding is half-up (away from zero), PRD §6.
import { halalas, type Halalas } from './money';

/** "3.75" (scale 8) → 375000000n. Throws on more decimals than `scale` or bad input. */
export function parseDecimal(value: string | number, scale: number): bigint {
  const text = typeof value === 'number' ? value.toFixed(scale) : value.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new RangeError(`Invalid decimal: "${value}"`);
  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.length > scale) {
    // Accept extra zeros only ("3.750000000").
    if (/[^0]/.test(fraction.slice(scale))) throw new RangeError(`Too many decimals: "${value}"`);
  }
  const digits = BigInt(whole + fraction.slice(0, scale).padEnd(scale, '0'));
  return sign ? -digits : digits;
}

/** n / d rounded half-up (away from zero). */
export function roundDiv(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError('Division by zero');
  const negative = n < 0n !== d < 0n;
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  const q = (a * 2n + b) / (b * 2n);
  return negative ? -q : q;
}

const toHalalas = (value: bigint): Halalas => halalas(Number(value));

/** FR-CAP-06: foreign amount × corporate rate (8 decimals) → SAR halalas. */
export function convertToSar(amount: Halalas, rate: string): Halalas {
  return toHalalas(roundDiv(BigInt(amount) * parseDecimal(rate, 8), 10n ** 8n));
}

/**
 * FR-CAP-07 / PRD §6: recoverable VAT inside a VAT-inclusive amount:
 * round(gross × rate / (100 + rate), 2). rate in percent, up to 2 decimals (15, 15.5).
 */
export function vatFromGross(gross: Halalas, ratePercent: string | number): Halalas {
  const bp = parseDecimal(ratePercent, 2); // basis points
  return toHalalas(roundDiv(BigInt(gross) * bp, 10000n + bp));
}

/** FR-CAP-05 mileage: quantity (≤ 2 decimals) × rate in SAR (≤ 4 decimals) → halalas. */
export function multiplyRate(quantity: string | number, rateSar: string): Halalas {
  // quantity·100 × rate·10⁴ = SAR·10⁶ → halalas = /10⁴
  return toHalalas(roundDiv(parseDecimal(quantity, 2) * parseDecimal(rateSar, 4), 10n ** 4n));
}

/** FR-CAP-05 per diem: days (≤ 2 decimals, e.g. 2.5) × daily rate in halalas. */
export function multiplyHalalas(quantity: string | number, rate: Halalas): Halalas {
  return toHalalas(roundDiv(parseDecimal(quantity, 2) * BigInt(rate), 100n));
}

/** |a − b| ≤ tolerance (all halalas). */
export function withinTolerance(a: Halalas, b: Halalas, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}
