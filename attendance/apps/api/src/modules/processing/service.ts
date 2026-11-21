// Attendance processing run (CI3 ProcessAttendanceModel::process_attendance_range): every day of
// the range for every target employee, same rules, same summary. Employees are independent, so a
// few are processed at once; the summary keeps CI3's order.
import type { ProcessRequest, ProcessRowError, ProcessSummary } from '@attendance/shared';
import { daysBetween, processDay, type SheetRow } from '../../domain/processing/day';
import { AppError } from '../../lib/errors';
import type { ProcessingRepository, TargetEmployee } from './repository';

const CONCURRENCY = 4;

type Counts = Omit<
  ProcessSummary,
  | 'department'
  | 'employeeNumber'
  | 'dateFrom'
  | 'dateTo'
  | 'totalEmployees'
  | 'employeeErrors'
  | 'rowErrors'
>;

interface EmployeeOutcome {
  counts: Counts;
  rowErrors: ProcessRowError[];
  employeeErrors: string[];
}

const zeroCounts = (): Counts => ({
  processedRows: 0,
  insertedRows: 0,
  updatedRows: 0,
  presentRows: 0,
  weeklyHolidayRows: 0,
  leaveRows: 0,
  absenceWithoutPermissionRows: 0,
  blankPunchRows: 0,
  errorRows: 0,
});

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function processEmployee(
  repo: ProcessingRepository,
  employee: TargetEmployee,
  days: string[],
  occasions: Awaited<ReturnType<ProcessingRepository['occasions']>>,
): Promise<EmployeeOutcome> {
  const counts = zeroCounts();
  const rowErrors: ProcessRowError[] = [];
  const empNo = employee.employeeNumber.trim();
  const masterName = employee.fullName.trim();

  if (empNo === '') {
    counts.errorRows++;
    return {
      counts,
      rowErrors,
      employeeErrors: ['Skipped one employee because EMPLOYEE_NUMBER is empty.'],
    };
  }
  const from = days[0]!;
  const to = days[days.length - 1]!;
  counts.processedRows = days.length;

  const failEveryDay = (error: string, rows: { day: string; name: string }[]) => {
    for (const { day, name } of rows) {
      counts.errorRows++;
      rowErrors.push({ employeeNumber: empNo, employeeName: name, attendanceDate: day, error });
    }
  };

  let results;
  let existing: Set<string>;
  try {
    const data = { ...(await repo.employeeData(empNo, from, to)), occasions };
    // CI3 looked up the profile only when both the master and the card had no name.
    const needsProfile =
      masterName === '' &&
      days.some((day) => !data.cards.find((c) => c.day === day)?.empName?.trim());
    const profileName = needsProfile ? await repo.profileName(empNo) : '';
    results = days.map((day) => processDay(empNo, masterName, profileName, data, day));
    existing = await repo.existingDays(empNo, from, to);
  } catch (error) {
    // CI3 caught the failure for each day and wrote nothing.
    failEveryDay(
      messageOf(error),
      days.map((day) => ({ day, name: masterName })),
    );
    return { counts, rowErrors, employeeErrors: [] };
  }

  for (const result of results) for (const counter of result.counters) counts[counter]++;

  const rows: SheetRow[] = results.map((r) => r.row);
  try {
    await repo.saveRows(rows);
    for (const row of rows) {
      if (existing.has(row.ATT_DATE)) counts.updatedRows++;
      else counts.insertedRows++;
    }
  } catch {
    failEveryDay(
      'Save failed.',
      rows.map((row) => ({ day: row.ATT_DATE, name: row.EMP_NAME ?? '' })),
    );
  }
  return { counts, rowErrors, employeeErrors: [] };
}

/** Runs `work` over `items` with at most `limit` in flight; results keep the input order. */
async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function runProcessing(
  repo: ProcessingRepository,
  request: ProcessRequest,
): Promise<ProcessSummary> {
  const department = request.department.trim();
  const employeeNumber = request.employeeNumber.trim().toUpperCase();
  const { fromDate, toDate } = request;

  const employees = await repo.targetEmployees(department, employeeNumber, fromDate, toDate);
  if (employees.length === 0) {
    throw new AppError('NOT_FOUND', 'Attendance process failed.', {
      error: 'No employees found for processing.',
    });
  }

  const days = daysBetween(fromDate, toDate);
  const occasions = await repo.occasions(fromDate, toDate);
  const outcomes = await mapLimited(employees, CONCURRENCY, (employee) =>
    processEmployee(repo, employee, days, occasions),
  );

  const summary: ProcessSummary = {
    department,
    employeeNumber,
    dateFrom: fromDate,
    dateTo: toDate,
    totalEmployees: employees.length,
    ...zeroCounts(),
    employeeErrors: [],
    rowErrors: [],
  };
  for (const outcome of outcomes) {
    for (const key of Object.keys(outcome.counts) as (keyof Counts)[])
      summary[key] += outcome.counts[key];
    summary.employeeErrors.push(...outcome.employeeErrors);
    summary.rowErrors.push(...outcome.rowErrors);
  }
  return summary;
}
