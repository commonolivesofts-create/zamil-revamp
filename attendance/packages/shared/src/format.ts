// PHP number helpers, so figures read exactly as the CI3 pages printed them.

/** PHP round($value, $decimals): half away from zero, on the decimal value. */
export function phpRound(value: number, decimals = 0): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const scaled = String(abs).includes('e') ? abs * 10 ** decimals : Number(`${abs}e${decimals}`);
  return (sign * Math.round(scaled)) / 10 ** decimals;
}

/** PHP number_format($value, $decimals): rounded, "," thousands, "." decimals. */
export function phpNumberFormat(value: number, decimals = 0): string {
  const rounded = phpRound(Number.isFinite(value) ? value : 0, decimals);
  const [whole = '0', fraction] = Math.abs(rounded).toFixed(decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}
