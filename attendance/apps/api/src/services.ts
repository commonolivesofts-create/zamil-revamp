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
} from '@attendance/shared';
import type { Db } from './db/oracle';
import { absenceRepository } from './modules/absences/repository';
import {
  attendanceCardListRepository,
  oracleAttendanceImporter,
  type AttendanceImporter,
} from './modules/attendanceCard/repository';
import { employeeRepository } from './modules/employees/repository';
import {
  occasionListRepository,
  oracleOccasionRepository,
  type OccasionRepository,
} from './modules/occasions/repository';
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
}

export function buildRepositories(db: Db, overrides: Partial<Repositories> = {}): Repositories {
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
  };
}
