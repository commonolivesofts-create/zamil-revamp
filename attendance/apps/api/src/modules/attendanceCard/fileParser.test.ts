import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  normalizeDate,
  normalizeTime,
  parseAttendanceRows,
  readSheet,
  type SheetRow,
} from './fileParser';

const csv = (text: string) => Buffer.from(text, 'utf8');
const sheet = (...rows: (string | number | null)[][]): SheetRow[] =>
  rows.map((cells, i) => ({ row: i + 1, cells }));

describe('normalizeDate', () => {
  it.each([
    ['15/01/2024', '2024-01-15'],
    ['15-01-2024', '2024-01-15'],
    ['5/1/2024', '2024-01-05'], // day-first even without padding (CI3 read it as May 1)
    ['01/15/2024', '2024-01-15'], // month-first only when day-first is impossible
    ['2024-01-15', '2024-01-15'],
    ['15 Jan 2024', '2024-01-15'],
    ['15-Jan-2024', '2024-01-15'],
    ['20240115', '2024-01-15'], // CI3 treated this as an Excel serial
    ['2024/01/15', '2024-01-15'], // formats CI3 accepted through strtotime()
    ['15.01.2024', '2024-01-15'],
    ['15 January 2024', '2024-01-15'],
    ['January 15, 2024', '2024-01-15'],
    ['Jan 15 2024', '2024-01-15'],
    [45306, '2024-01-15'], // Excel serial
    ['31/02/2024', null],
    ['tomorrow', null],
    ['', null],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  it('reads Excel date cells', () => {
    expect(normalizeDate(new Date(Date.UTC(2024, 0, 15)))).toBe('2024-01-15');
  });
});

describe('normalizeTime', () => {
  it.each([
    ['08:30', '08:30'],
    ['8:05', '08:05'],
    ['08:30:59', '08:30'],
    ['8.30', '08:30'], // CI3 read this as a day fraction: 07:12
    ['0830', '08:30'], // CI3: 00:00
    ['1745', '17:45'],
    ['08:30 PM', '20:30'],
    ['12:15 AM', '00:15'],
    [0.5, '12:00'], // Excel time fraction
    [45306.75, '18:00'], // Excel date-time keeps its time
    ['0.354166667', '08:30'],
    ['25:00', null],
    ['8', null],
    ['noon', null],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeTime(input)).toBe(expected);
  });
});

describe('parseAttendanceRows', () => {
  it('finds the header anywhere and validates rows with the CI3 messages', () => {
    const result = parseAttendanceRows(
      sheet(
        ['Attendance export'],
        ['EMPLOYEE_ID', 'First Name', 'Department', 'Date', 'First-Punch', 'Last  Punch'],
        ['1001', 'Ali', 'IT', '15/01/2024', '07:58', '16:05'],
        [null, null, null, null, null, null],
        ['', 'No id', 'IT', 'bad', '7', ''],
        ['1001', 'Ali', 'IT', '15/01/2024', '08:00', '16:00'],
        ['1002', '', 'IT', '2024-01-15', '0800', '1700'],
      ),
    );
    expect(result.totalDataRows).toBe(5);
    expect(result.valid).toEqual([
      {
        row: 3,
        empNo: '1001',
        empName: 'Ali',
        attDate: '2024-01-15',
        punchIn: '07:58',
        punchOut: '16:05',
      },
      {
        row: 7,
        empNo: '1002',
        empName: '',
        attDate: '2024-01-15',
        punchIn: '08:00',
        punchOut: '17:00',
      },
    ]);
    expect(result.errors).toEqual([
      {
        row: 5,
        employeeId: '',
        errors: 'Employee ID is empty, Invalid date, Invalid First Punch, Invalid Last Punch',
      },
      { row: 6, employeeId: '1001', errors: 'Duplicate employee/date in uploaded file' },
    ]);
  });

  it('rejects files without the required columns, and empty files', () => {
    expect(() => parseAttendanceRows(sheet(['Employee ID', 'Date']))).toThrow(
      /Required columns not found/,
    );
    expect(() => parseAttendanceRows(sheet([null, '']))).toThrow('The uploaded file is empty.');
  });
});

describe('readSheet', () => {
  it('reads CSV with a BOM and quoted cells', async () => {
    const rows = await readSheet(
      csv(
        '﻿Employee ID,First Name,Date,First Punch,Last Punch\r\n1001,"Ali, A",15/01/2024,08:00,17:00\r\n',
      ),
      'export.CSV',
    );
    expect(rows[1]).toEqual({ row: 2, cells: ['1001', 'Ali, A', '15/01/2024', '08:00', '17:00'] });
  });

  it('reads the first visible XLSX sheet, keeping real row numbers', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Hidden', { state: 'hidden' }).addRow(['nothing']);
    const ws = book.addWorksheet('Attendance');
    ws.addRow(['Employee ID', 'First Name', 'Date', 'First Punch', 'Last Punch']);
    ws.addRow([]);
    ws.addRow([1001, 'Ali', new Date(Date.UTC(2024, 0, 15)), 0.3333333333, 0.7083333333]);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());

    const parsed = parseAttendanceRows(await readSheet(buffer, 'export.xlsx'));
    expect(parsed.valid).toEqual([
      {
        row: 3,
        empNo: '1001',
        empName: 'Ali',
        attDate: '2024-01-15',
        punchIn: '08:00',
        punchOut: '17:00',
      },
    ]);
  });

  it('refuses other file types', async () => {
    await expect(readSheet(csv('x'), 'old.xls')).rejects.toThrow(/Only CSV and XLSX/);
  });
});
