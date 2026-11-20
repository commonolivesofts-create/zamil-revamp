// CSV export shared by every report: UTF-8 with BOM (opens correctly in Excel), CRLF rows,
// RFC 4180 quoting, and formula-injection protection for cells starting with = + - @.
import type { Response } from 'express';

export interface CsvColumn<T> {
  key: keyof T & string;
  label: string;
}

const FORMULA_START = /^[=+\-@\t\r]/;
/** UTF-8 byte order mark, so Excel opens the file as UTF-8. */
export const BOM = String.fromCharCode(0xfeff);

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(columns: readonly CsvColumn<T>[], rows: readonly T[]): string {
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** e.g. employee_details_20261120_143005.csv (server local time, like CI3). */
export function csvFileName(prefix: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${prefix}_${stamp}.csv`;
}

export function sendCsv<T>(
  res: Response,
  prefix: string,
  columns: readonly CsvColumn<T>[],
  rows: readonly T[],
): void {
  res
    .status(200)
    .type('text/csv; charset=utf-8')
    .attachment(csvFileName(prefix))
    .send(toCsv(columns, rows));
}
