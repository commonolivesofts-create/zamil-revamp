// Reads a biometric attendance export (CSV or XLSX) and turns it into validated rows.
// CI3: libraries/Attendance_file_reader.php + Attendance_card::buildAttendanceRows.
//
// Same rules as CI3: header row found by its column names, both punches required, duplicates of
// employee + date within the file rejected (first one wins), same error texts.
// Fixed: numeric-looking times ('0830', '8.30') are read as times (CI3 turned '8.30' into 07:12);
// row numbers are real file rows (CI3 drifted on blank XLSX rows); unpadded dates such as
// 5/1/2024 are day-first like 05/01/2024 (CI3 read them US-style); the first visible worksheet
// is used (CI3 used sheet1.xml); unreadable values are rejected (no strtotime guessing).
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { formatPunch, type UploadError, type UploadRow } from '@attendance/shared';
import { AppError } from '../../lib/errors';

export type Cell = string | number | Date | null;
export interface SheetRow {
  /** 1-based row number in the file. */
  row: number;
  cells: Cell[];
}

const fail = (message: string) => new AppError('VALIDATION', message);

/* ---------------- Reading ---------------- */

export async function readSheet(buffer: Buffer, fileName: string): Promise<SheetRow[]> {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'csv') return readCsv(buffer);
  if (extension === 'xlsx') return readXlsx(buffer);
  throw fail('Only CSV and XLSX files are supported. Please save old XLS files as XLSX.');
}

function readCsv(buffer: Buffer): SheetRow[] {
  let records: { record: string[]; info: { lines: number } }[];
  try {
    // With `info: true` each record comes with its position; the typings do not model that.
    records = parse(buffer, {
      bom: true,
      relax_column_count: true,
      info: true,
      skip_empty_lines: false,
    }) as unknown as typeof records;
  } catch {
    throw fail('Unable to read the CSV file. Check that it is a valid comma-separated file.');
  }
  return records.map(({ record, info }) => ({ row: info.lines, cells: record }));
}

function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) return value;
  if (typeof value === 'boolean') return String(value);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('result' in value) return cellValue(value.result as ExcelJS.CellValue);
  if ('text' in value) return String(value.text);
  return null;
}

async function readXlsx(buffer: Buffer): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw fail('Unable to open XLSX file.');
  }
  const sheet = workbook.worksheets.find((ws) => ws.state === 'visible') ?? workbook.worksheets[0];
  if (!sheet) throw fail('The first worksheet could not be read.');
  const rows: SheetRow[] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: Cell[] = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(cellValue(row.getCell(c).value));
    rows.push({ row: r, cells });
  }
  return rows;
}

/* ---------------- Normalising values ---------------- */

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** YYYY-MM-DD, or null when the value is not a readable date. */
export function normalizeDate(cell: Cell): string | null {
  if (cell === null) return null;
  if (cell instanceof Date) {
    return cell.getUTCFullYear() < 1900 ? null : cell.toISOString().slice(0, 10);
  }
  const text = String(cell).trim();
  if (!text) return null;
  if (/^\d{8}$/.test(text))
    return validDate(+text.slice(0, 4), +text.slice(4, 6), +text.slice(6, 8));
  if (/^\d+(\.\d+)?$/.test(text)) {
    // Excel serial date (days since 1899-12-30), e.g. 45306 = 2024-01-15.
    const serial = Math.floor(Number(text));
    if (serial < 20000 || serial > 99999) return null;
    return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }
  // Formats CI3 read directly or through its strtotime() fallback.
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (m) return validDate(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m) return validDate(+m[3]!, +m[2]!, +m[1]!) ?? validDate(+m[3]!, +m[1]!, +m[2]!);
  const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]+(\d{4})$/.exec(text);
  if (m && month(m[2]!)) return validDate(+m[3]!, month(m[2]!), +m[1]!);
  m = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (m && month(m[1]!)) return validDate(+m[3]!, month(m[1]!), +m[2]!);
  return null;
}

/** HH:MM (24 h), or null when the value is not a readable time. */
export function normalizeTime(cell: Cell): string | null {
  if (cell === null) return null;
  if (cell instanceof Date) return `${pad(cell.getUTCHours())}:${pad(cell.getUTCMinutes())}`;
  if (typeof cell === 'number' || (/^\d*\.\d+$/.test(cell.trim()) && Number(cell) < 1)) {
    // Excel time: a fraction of a day (date-times keep only their fraction).
    const fraction = Number(cell) % 1;
    const minutes = Math.round(fraction * 1440) % 1440;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }
  return formatPunch(cell);
}

/* ---------------- Rows ---------------- */

const REQUIRED = ['employee id', 'date', 'first punch', 'last punch'] as const;
const normalizeHeader = (value: Cell) =>
  String(value ?? '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export interface ParsedFile {
  totalDataRows: number;
  valid: UploadRow[];
  errors: UploadError[];
}

export function parseAttendanceRows(rows: SheetRow[]): ParsedFile {
  if (rows.every((r) => r.cells.every((c) => c === null || String(c).trim() === ''))) {
    throw fail('The uploaded file is empty.');
  }
  const headerIndex = rows.findIndex((r) => {
    const names = r.cells.map(normalizeHeader);
    return REQUIRED.every((name) => names.includes(name));
  });
  if (headerIndex < 0) {
    throw fail(
      'Required columns not found. Expected: Employee ID, Date, First Punch and Last Punch (First Name is optional).',
    );
  }
  const columns = new Map<string, number>();
  rows[headerIndex]!.cells.forEach((cell, index) => columns.set(normalizeHeader(cell), index));
  const at = (cells: Cell[], name: string) => {
    const index = columns.get(name);
    return index === undefined ? null : (cells[index] ?? null);
  };

  const valid: UploadRow[] = [];
  const errors: UploadError[] = [];
  const seen = new Set<string>();
  const dataRows = rows.slice(headerIndex + 1);

  for (const { row, cells } of dataRows) {
    const empNo = String(at(cells, 'employee id') ?? '').trim();
    const empName = String(at(cells, 'first name') ?? '').trim();
    const attDate = normalizeDate(at(cells, 'date'));
    const punchIn = normalizeTime(at(cells, 'first punch'));
    const punchOut = normalizeTime(at(cells, 'last punch'));
    const blank = (name: string) => String(at(cells, name) ?? '').trim() === '';
    if (!empNo && blank('date') && blank('first punch') && blank('last punch')) continue;

    const problems: string[] = [];
    if (!empNo) problems.push('Employee ID is empty');
    if (!attDate) problems.push('Invalid date');
    if (!punchIn) problems.push('Invalid First Punch');
    if (!punchOut) problems.push('Invalid Last Punch');
    const key = `${empNo.toUpperCase()}|${attDate}`;
    if (problems.length === 0 && seen.has(key))
      problems.push('Duplicate employee/date in uploaded file');

    if (problems.length) {
      errors.push({ row, employeeId: empNo, errors: problems.join(', ') });
      continue;
    }
    seen.add(key);
    valid.push({ row, empNo, empName, attDate: attDate!, punchIn: punchIn!, punchOut: punchOut! });
  }

  return { totalDataRows: dataRows.length, valid, errors };
}
