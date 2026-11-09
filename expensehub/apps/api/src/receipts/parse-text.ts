// FR-CAP-03: turn OCR text into *proposed* merchant / date / total / VAT. The user confirms every
// value; QR values always win over these (FR-CAP-03).

export interface OcrFields {
  merchant: string | null;
  date: string | null;
  total: string | null;
  vat: string | null;
}

const AMOUNT = /(\d{1,3}(?:[,\s]\d{3})+|\d+)[.,](\d{2})(?!\d)/g;
const NOT_MERCHANT =
  /\b(?:invoice|receipt|tax|vat|date|time|tel|phone|cashier|order|table)\b|فاتورة|ضريبة/i;

function amounts(line: string): string[] {
  return [...line.matchAll(AMOUNT)].map((m) => `${m[1]!.replace(/[,\s]/g, '')}.${m[2]}`);
}

function isoDate(day: number, month: number, year: number): string | null {
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day)
    return null;
  return d.toISOString().slice(0, 10);
}

/** KSA receipts print day first; ISO dates are also recognised. */
function findDate(text: string): string | null {
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (iso) return isoDate(Number(iso[3]), Number(iso[2]), Number(iso[1]));
  const dmy = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
  if (dmy) return isoDate(Number(dmy[1]), Number(dmy[2]), Number(dmy[3]));
  return null;
}

export function parseReceiptText(text: string): OcrFields {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const merchant =
    lines.find(
      (l) =>
        (l.match(/\p{L}/gu) ?? []).length >= 3 && !NOT_MERCHANT.test(l) && amounts(l).length === 0,
    ) ?? null;

  let total: string | null = null;
  for (const line of lines) {
    if (/sub\s*-?\s*total/i.test(line)) continue;
    if (/(grand\s+)?total|amount\s+due|net\s+amount|الإجمالي|المجموع/i.test(line)) {
      const found = amounts(line);
      if (found.length) total = found.at(-1)!;
    }
  }
  if (!total) {
    // Compare as integer halalas — money never goes through JS floats.
    const all = lines.flatMap(amounts);
    for (const a of all)
      if (!total || BigInt(a.replace('.', '')) > BigInt(total.replace('.', ''))) total = a;
  }

  let vat: string | null = null;
  for (const line of lines) {
    if (/\bvat\b|\btax\b|ضريبة/i.test(line) && !/(vat|tax)\s*(no|number|reg|#)/i.test(line)) {
      const found = amounts(line);
      if (found.length) vat = found.at(-1)!;
    }
  }

  return { merchant: merchant?.slice(0, 240) ?? null, date: findDate(text), total, vat };
}
