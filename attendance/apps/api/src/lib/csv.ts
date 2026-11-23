// CSV export, written like CI3's fputcsv: header row, "\n" line endings, no BOM (unless that CI3
// export wrote one), a field quoted when it contains a comma, quote, backslash, space, tab or line
// break. Each report defines CI3's own
// columns (headers and value formats) so exported files stay the same as before.
import type { Response } from 'express';
import { AppError } from './errors';

export interface CsvColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\s\\]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(columns: readonly CsvColumn<T>[], rows: readonly T[]): string {
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(','));
  return `${lines.join('\n')}\n`;
}

/** e.g. employee_data_20261120_143005.csv (server local time, as CI3's date('Ymd_His')). */
export function csvFileName(prefix: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${prefix}_${stamp}.csv`;
}

export interface CsvExport<T> {
  /** CI3 file name prefix, e.g. 'employee_data'. */
  filePrefix: string;
  columns: readonly CsvColumn<T>[];
  /** CI3 message when nothing matches, e.g. 'No employee data found to export.' */
  emptyMessage: string;
  /** CI3 wrote a header-only file instead of an error (Alerts). */
  allowEmpty?: boolean;
  /** CI3 started the file with a UTF-8 byte order mark (Alerts). */
  bom?: boolean;
}

export function sendCsv<T>(
  res: Response,
  spec: CsvExport<T>,
  rows: readonly T[],
  /** CI3 file name when it was not prefix_YYYYMMDD_HHMMSS.csv. */
  fileName?: string,
): void {
  if (rows.length === 0 && !spec.allowEmpty) throw new AppError('NOT_FOUND', spec.emptyMessage);
  res
    .status(200)
    .type(spec.bom ? 'text/csv; charset=UTF-8' : 'text/csv')
    .attachment(fileName ?? csvFileName(spec.filePrefix))
    .send(`${spec.bom ? '﻿' : ''}${toCsv(spec.columns, rows)}`);
}

/** Server time as PHP date('d M Y, h:i A'), e.g. '21 Nov 2026, 02:30 PM' (CI3 "generated at"). */
export function nowDMYTime(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return dMYTime(
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`,
  )!;
}

/* ---- CI3 value formats ---- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-01-05' -> '05 Jan 2026' (PHP 'd M Y'); null/invalid -> null. */
export function dMY(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}

/** '2026-01-05 14:30:00' -> '05 Jan 2026, 02:30 PM' (PHP 'd M Y, h:i A'). */
export function dMYTime(timestamp: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(timestamp ?? '');
  if (!m) return null;
  const hours = Number(m[2]);
  return `${dMY(m[1])}, ${String(hours % 12 || 12).padStart(2, '0')}:${m[3]} ${hours >= 12 ? 'PM' : 'AM'}`;
}

/** '2020-01-15' -> '15-JAN-20' (Oracle's default DATE format, which CI3 exported raw). */
export function oracleDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]!.toUpperCase()}-${m[1]!.slice(2)}` : null;
}

/** CI3 display columns show '-' for empty values. */
export const dash = (value: string | number | null | undefined): string | number =>
  value === null || value === undefined || value === '' ? '-' : value;

/** 'Y' -> 'Yes', 'N' -> 'No', else '-' (CI3 *_display). */
export const yesNo = (value: string | null | undefined): string =>
  value === 'Y' ? 'Yes' : value === 'N' ? 'No' : '-';
