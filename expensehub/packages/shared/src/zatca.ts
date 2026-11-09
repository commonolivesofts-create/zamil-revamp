// Implements: FR-CAP-04, D-22, OQ-24 proposal — ZATCA e-invoice QR (base64 TLV).
// Phase 1 decodes tags 1–5 and checks the fields; tags 6–9 (hash, signature, key) are kept for
// the phase-2 cryptographic check. Runs in the browser and in Node.
import { parseSar, type Halalas } from './money';

export interface ZatcaFields {
  sellerName: string;
  vatNumber: string;
  /** ISO-8601 as printed on the invoice. */
  timestamp: string;
  total: string;
  vat: string;
}

export interface ZatcaResult {
  /** TLV structure could be read. */
  decoded: boolean;
  /** All OQ-24 checks passed → VAT may be recovered (D-22). */
  valid: boolean;
  fields: Partial<ZatcaFields>;
  /** Tags 6–9 present (e-invoicing phase 2). */
  hasSignature: boolean;
  errors: string[];
}

const TAG_NAMES: Record<number, keyof ZatcaFields> = {
  1: 'sellerName',
  2: 'vatNumber',
  3: 'timestamp',
  4: 'total',
  5: 'vat',
};

function base64ToBytes(base64: string): Uint8Array | null {
  const clean = base64.trim().replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) return null;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Reads TLV records; supports BER long-form lengths for large phase-2 tags. */
function readTlv(bytes: Uint8Array): Map<number, Uint8Array> | null {
  const out = new Map<number, Uint8Array>();
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i];
    let length = bytes[i + 1];
    if (tag === undefined || length === undefined) return null;
    i += 2;
    if (length & 0x80) {
      const count = length & 0x7f;
      if (count === 0 || count > 2) return null;
      length = 0;
      for (let k = 0; k < count; k += 1) {
        const b = bytes[i + k];
        if (b === undefined) return null;
        length = (length << 8) | b;
      }
      i += count;
    }
    if (i + length > bytes.length) return null;
    out.set(tag, bytes.slice(i, i + length));
    i += length;
  }
  return out;
}

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * OQ-24 phase-1 checks: VAT number = 15 digits starting and ending with 3; total and VAT present;
 * VAT ≈ total × 15/115 (± SAR 0.05); timestamp valid and not in the future.
 */
export function decodeZatcaQr(text: string, now: Date = new Date()): ZatcaResult {
  const bytes = base64ToBytes(text);
  const records = bytes ? readTlv(bytes) : null;
  if (!records || !records.has(1)) {
    return {
      decoded: false,
      valid: false,
      fields: {},
      hasSignature: false,
      errors: ['Not a ZATCA QR code'],
    };
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const fields: Partial<ZatcaFields> = {};
  for (const [tag, name] of Object.entries(TAG_NAMES)) {
    const value = records.get(Number(tag));
    if (value) fields[name] = decoder.decode(value).trim();
  }

  const errors: string[] = [];
  if (!fields.sellerName) errors.push('Seller name is missing');
  if (!fields.vatNumber || !/^3\d{13}3$/.test(fields.vatNumber)) {
    errors.push('Seller VAT number must be 15 digits starting and ending with 3');
  }
  const timestamp = fields.timestamp ? Date.parse(fields.timestamp) : Number.NaN;
  if (Number.isNaN(timestamp)) errors.push('Invoice date is missing or invalid');
  else if (timestamp > now.getTime() + 5 * 60_000) errors.push('Invoice date is in the future');

  let total: Halalas | null = null;
  let vat: Halalas | null = null;
  if (!fields.total || !AMOUNT.test(fields.total))
    errors.push('Invoice total is missing or invalid');
  else total = parseSar(fields.total);
  if (!fields.vat || !AMOUNT.test(fields.vat)) errors.push('VAT amount is missing or invalid');
  else vat = parseSar(fields.vat);
  if (total !== null && vat !== null) {
    // VAT ≈ total × 15/115, ± SAR 0.05 (OQ-24).
    const expected = Math.round((total * 15) / 115);
    if (Math.abs(expected - vat) > 5) errors.push('VAT does not match 15% of the invoice total');
  }

  return {
    decoded: true,
    valid: errors.length === 0,
    fields,
    hasSignature: [6, 7, 8, 9].some((t) => records.has(t)),
    errors,
  };
}

/** Builds a ZATCA QR payload (tests, sample receipts). */
export function encodeZatcaQr(fields: ZatcaFields): string {
  const encoder = new TextEncoder();
  const parts: number[] = [];
  const values = [fields.sellerName, fields.vatNumber, fields.timestamp, fields.total, fields.vat];
  values.forEach((value, index) => {
    const bytes = encoder.encode(value);
    if (bytes.length > 255) throw new RangeError('TLV value too long');
    parts.push(index + 1, bytes.length, ...bytes);
  });
  return bytesToBase64(Uint8Array.from(parts));
}
