// Employees from Oracle Fusion HCM — the only Fusion integration TrainingHub has. Everything
// else (skills, positions, sessions, approvals, exams) lives in TrainingHub's own ADW tables.
import type { AppConfig } from '../../config';
import type { OracleStore } from '../../db/oracle';
import { FusionError, runBipReport } from './bip';

export interface FusionEmployee {
  personId: number;
  personNumber: string;
  fullName: string;
  email: string | null;
  mobile: string | null;
  assignmentId: number | null;
  buCode: string | null;
  jobName: string | null;
  departmentName: string | null;
  positionName: string | null;
  gradeName: string | null;
  locationCode: string | null;
  supervisorPersonId: number | null;
  active: boolean;
}

const str = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const int = (v: string | undefined) => (v && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

/** BIP row → employee. Works with TH_HCM_EMPLOYEES and with ExpenseHub's EH_HCM_EMPLOYEES (no dept/position/grade). */
export function mapEmployeeRow(r: Record<string, string>): FusionEmployee | null {
  const personId = int(r.PERSON_ID);
  const personNumber = str(r.PERSON_NUMBER);
  const fullName = str(r.FULL_NAME);
  if (!personId || !personNumber || !fullName) return null;
  return {
    personId,
    personNumber,
    fullName,
    email: str(r.EMAIL),
    mobile: str(r.MOBILE),
    assignmentId: int(r.ASSIGNMENT_ID),
    buCode: str(r.BU_CODE),
    jobName: str(r.JOB_NAME),
    departmentName: str(r.DEPARTMENT_NAME),
    positionName: str(r.POSITION_NAME),
    gradeName: str(r.GRADE_NAME),
    locationCode: str(r.LOCATION_CODE),
    supervisorPersonId: int(r.SUPERVISOR_PERSON_ID),
    active: (r.ACTIVE_FLAG ?? 'Y').trim().toUpperCase() !== 'N',
  };
}

export interface EmployeeSource {
  readonly kind: 'mock' | 'live' | 'sql';
  fetchEmployees(asOf: string): Promise<{ rows: FusionEmployee[]; report: string; skipped: number }>;
}

export class LiveEmployeeSource implements EmployeeSource {
  readonly kind = 'live' as const;
  constructor(private readonly f: AppConfig['fusion']) {}

  async fetchEmployees(asOf: string) {
    const conn = { baseUrl: this.f.baseUrl!, user: this.f.user!, password: this.f.password! };
    const reports = [this.f.employeeReport, this.f.employeeReportFallback].filter((x, i, a) => x && a.indexOf(x) === i);
    let last: Error | undefined;
    for (const report of reports) {
      try {
        const res = await runBipReport(conn, report, { P_AS_OF_DATE: asOf });
        const mapped = res.body.map(mapEmployeeRow);
        const rows = mapped.filter((x): x is FusionEmployee => !!x);
        return { rows, report, skipped: mapped.length - rows.length };
      } catch (e) {
        last = e as Error;
        // Only a missing / inaccessible report is worth trying the fallback for.
        if (!(e instanceof FusionError) || e.retryable || e.httpStatus === 401) throw e;
      }
    }
    throw last ?? new FusionError('No employee report configured', null, false);
  }
}

export class MockEmployeeSource implements EmployeeSource {
  readonly kind = 'mock' as const;
  constructor(private readonly people: FusionEmployee[]) {}
  async fetchEmployees() {
    return { rows: structuredClone(this.people), report: 'mock', skipped: 0 };
  }
}

/** Employees from an existing ADW table or view (e.g. an HR extract another app keeps fresh).
 *  The SELECT must alias its columns like the BIP report: PERSON_ID, PERSON_NUMBER, FULL_NAME,
 *  EMAIL, JOB_NAME, DEPARTMENT_NAME, SUPERVISOR_PERSON_ID, ACTIVE_FLAG (others optional). */
export class SqlEmployeeSource implements EmployeeSource {
  readonly kind = 'sql' as const;
  constructor(
    private readonly store: OracleStore,
    private readonly sql: string,
  ) {}
  async fetchEmployees() {
    const res = await this.store.exec<Record<string, unknown>>(this.sql.trim().replace(/;\s*$/, ''));
    const mapped = (res.rows ?? []).map((r) =>
      mapEmployeeRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toUpperCase(), v == null ? '' : String(v)]))),
    );
    const rows = mapped.filter((x): x is FusionEmployee => !!x);
    return { rows, report: 'EMPLOYEE_SQL', skipped: mapped.length - rows.length };
  }
}
