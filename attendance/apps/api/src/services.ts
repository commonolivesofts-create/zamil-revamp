// Composition root: every repository, built over the Oracle Db unless a test overrides it.
import type {
  AbsenceFilters,
  AbsenceRow,
  AttendanceCardFilters,
  AttendanceCardRow,
  EmployeeFilters,
  EmployeeRow,
  OccasionFilters,
  OccasionRow,
  ShiftDetailFilters,
  ShiftDetailRow,
  ShiftFilters,
  ShiftRow,
  TimetableFilters,
  TimetableRow,
  TimesheetFilters,
  TimesheetRow,
} from '@attendance/shared';
import { ebsSource } from './db/ebsSource';
import type { Db } from './db/oracle';
import { absenceRepository } from './modules/absences/repository';
import {
  dailyAttendanceRepository,
  type DailyAttendanceRepository,
} from './modules/dailyAttendance/repository';
import {
  oracleLeaveRequestRepository,
  type LeaveRequestRepository,
} from './modules/leaveRequests/routes';
import { oracleManagerRepository, type ManagerRepository } from './modules/manager/repository';
import {
  oracleConEmployeeRepository,
  oracleContractorRepository,
  oracleContractorSummaryRepository,
  type ConEmployeeRepository,
  type ContractorRepository,
  type ContractorSummaryRepository,
} from './modules/contractors/repository';
import { oracleAlertsRepository, type AlertsRepository } from './modules/alerts/repository';
import {
  attendanceCardListRepository,
  oracleAttendanceImporter,
  type AttendanceImporter,
} from './modules/attendanceCard/repository';
import {
  oracleDashboardRepository,
  type DashboardRepository,
} from './modules/dashboard/repository';
import { employeeRepository } from './modules/employees/repository';
import {
  occasionListRepository,
  oracleOccasionRepository,
  type OccasionRepository,
} from './modules/occasions/repository';
import {
  oraclePayrollFileRepository,
  type PayrollFileRepository,
} from './modules/payrollFile/repository';
import {
  oracleProcessingRepository,
  type ProcessingRepository,
} from './modules/processing/repository';
import type { ReportRepository } from './modules/report';
import {
  oracleShiftRepository,
  shiftDetailListRepository,
  shiftListRepository,
  type ShiftRepository,
} from './modules/shifts/repository';
import {
  oracleTimetableRepository,
  timetableListRepository,
  type TimetableRepository,
} from './modules/timetables/repository';
import { timesheetRepository } from './modules/timesheet/routes';

export interface Repositories {
  employees: ReportRepository<EmployeeFilters, EmployeeRow>;
  absences: ReportRepository<AbsenceFilters, AbsenceRow>;
  shifts: ShiftRepository;
  shiftList: ReportRepository<ShiftFilters, ShiftRow>;
  shiftWeekList: ReportRepository<ShiftDetailFilters, ShiftDetailRow>;
  timetables: TimetableRepository;
  timetableList: ReportRepository<TimetableFilters, TimetableRow>;
  occasions: OccasionRepository;
  occasionList: ReportRepository<OccasionFilters, OccasionRow>;
  attendanceCardList: ReportRepository<AttendanceCardFilters, AttendanceCardRow>;
  attendanceImporter: AttendanceImporter;
  processing: ProcessingRepository;
  timesheet: ReportRepository<TimesheetFilters, TimesheetRow>;
  payroll: PayrollFileRepository;
  alerts: AlertsRepository;
  dashboard: DashboardRepository;
  daily: DailyAttendanceRepository;
  leave: LeaveRequestRepository;
  manager: ManagerRepository;
  contractors: ContractorRepository;
  conEmployees: ConEmployeeRepository;
  contractorSummary: ContractorSummaryRepository;
}

export function buildRepositories(
  db: Db,
  overrides: Partial<Repositories> = {},
  /** Where EBS data is read from (EBS_SOURCE). */
  ebsMode: 'ebs' | 'adw' = 'ebs',
): Repositories {
  const ebs = ebsSource(ebsMode);
  return {
    employees: overrides.employees ?? employeeRepository(db),
    absences: overrides.absences ?? absenceRepository(db),
    shifts: overrides.shifts ?? oracleShiftRepository(db),
    shiftList: overrides.shiftList ?? shiftListRepository(db),
    shiftWeekList: overrides.shiftWeekList ?? shiftDetailListRepository(db),
    timetables: overrides.timetables ?? oracleTimetableRepository(db),
    timetableList: overrides.timetableList ?? timetableListRepository(db),
    occasions: overrides.occasions ?? oracleOccasionRepository(db),
    occasionList: overrides.occasionList ?? occasionListRepository(db),
    attendanceCardList: overrides.attendanceCardList ?? attendanceCardListRepository(db),
    attendanceImporter: overrides.attendanceImporter ?? oracleAttendanceImporter(db),
    processing: overrides.processing ?? oracleProcessingRepository(db),
    timesheet: overrides.timesheet ?? timesheetRepository(db),
    payroll: overrides.payroll ?? oraclePayrollFileRepository(db),
    alerts: overrides.alerts ?? oracleAlertsRepository(db),
    dashboard: overrides.dashboard ?? oracleDashboardRepository(db),
    daily: overrides.daily ?? dailyAttendanceRepository(db, ebs),
    leave: overrides.leave ?? oracleLeaveRequestRepository(db),
    manager: overrides.manager ?? oracleManagerRepository(db, ebs),
    contractors: overrides.contractors ?? oracleContractorRepository(db, ebs),
    conEmployees: overrides.conEmployees ?? oracleConEmployeeRepository(db, ebs),
    contractorSummary: overrides.contractorSummary ?? oracleContractorSummaryRepository(db, ebs),
  };
}
