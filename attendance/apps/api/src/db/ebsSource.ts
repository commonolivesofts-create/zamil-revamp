// Where the EBS data comes from (see ../../../../EBS-CONNECTIVITY.md):
//   EBS_SOURCE=ebs  the E-Business Suite database itself, as CI3 does (Zamil LAN/VPN)  [default]
//   EBS_SOURCE=adw  copies of the same tables in ADW, filled by the office sync job (Option B)
// Repositories never name EBS objects directly; they use this map, so switching is configuration.
import type { PoolName } from './oracle';

export interface EbsSource {
  pool: PoolName;
  tables: {
    iclockTransaction: string;
    personnelEmployee: string;
    attPayloadbase: string;
    xxTimetable: string;
    contractorInfo: string;
    conEmployeeInfo: string;
    hrOrganizationUnits: string;
    perJobsTl: string;
    perPeopleX: string;
    perAssignmentsX: string;
  };
}

export const EBS_DIRECT: EbsSource = {
  pool: 'ebs',
  tables: {
    iclockTransaction: 'ZPI.ICLOCK_TRANSACTION',
    personnelEmployee: 'ZPI.PERSONNEL_EMPLOYEE',
    attPayloadbase: 'ZPI.ATT_PAYLOADBASE',
    xxTimetable: 'ZPI.XX_TIMETABLE',
    contractorInfo: 'XXZP.XX_CONTRACTOR_INFO',
    conEmployeeInfo: 'XXZP.XX_CON_EMPLOYEE_INFO',
    hrOrganizationUnits: 'HR_ORGANIZATION_UNITS',
    perJobsTl: 'PER_JOBS_TL',
    perPeopleX: 'PER_PEOPLE_X',
    perAssignmentsX: 'PER_ASSIGNMENTS_X',
  },
};

/** Proposed ADW mirror tables (Option B). Not created yet: needs approval and the sync job. */
export const EBS_ADW_MIRROR: EbsSource = {
  pool: 'adw',
  tables: {
    iclockTransaction: 'XX_EBS_ICLOCK_TRANSACTION',
    personnelEmployee: 'XX_EBS_PERSONNEL_EMPLOYEE',
    attPayloadbase: 'XX_EBS_ATT_PAYLOADBASE',
    xxTimetable: 'XX_EBS_XX_TIMETABLE',
    contractorInfo: 'XX_CONTRACTOR_INFO',
    conEmployeeInfo: 'XX_CON_EMPLOYEE_INFO',
    hrOrganizationUnits: 'XX_EBS_HR_ORGANIZATION_UNITS',
    perJobsTl: 'XX_EBS_PER_JOBS_TL',
    perPeopleX: 'XX_EBS_PER_PEOPLE_X',
    perAssignmentsX: 'XX_EBS_PER_ASSIGNMENTS_X',
  },
};

export const ebsSource = (mode: 'ebs' | 'adw'): EbsSource =>
  mode === 'adw' ? EBS_ADW_MIRROR : EBS_DIRECT;
