// Implements: TRD §4.1 — money is integer halalas (1 SAR = 100 halalas), never JS floats.
// FX, VAT and rounding rules arrive with the policy engine in M4.

/** An amount in SAR, held as a whole number of halalas. */
export type Halalas = number & { readonly __brand: 'Halalas' };

export const ZERO_SAR = 0 as Halalas;

const SAR_PATTERN = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/;

export function isHalalas(value: unknown): value is Halalas {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Wraps an integer halala count. Throws on fractions or unsafe integers. */
export function halalas(value: number): Halalas {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Not a whole number of halalas: ${value}`);
  return value as Halalas;
}

/**
 * Parses SAR input: "1840", "1,840.5", "-500.00" → halalas. More than 2 decimals is rejected.
 * A JS number is accepted only at the input edge and rounded once (TRD §4.1).
 */
export function parseSar(input: string | number): Halalas {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new RangeError(`Invalid SAR amount: ${input}`);
    return halalas(Math.round(input * 100));
  }
  const match = SAR_PATTERN.exec(input.trim().replace(/,/g, ''));
  if (!match) throw new RangeError(`Invalid SAR amount: "${input}"`);
  const [, sign, whole = '0', fraction = ''] = match;
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return halalas(sign ? -value : value);
}

/** Halalas → API string with 2 decimals (API §1): 184000 → "1840.00". */
export function formatSar(amount: Halalas): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function sumSar(amounts: readonly Halalas[]): Halalas {
  let total = 0;
  for (const amount of amounts) total += amount;
  return halalas(total);
}
