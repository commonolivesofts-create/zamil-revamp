// Payroll File (CI3 /report/payroll-file): POST /payroll-file/list, /payroll-file/export and
// /payroll-file/adjustment (CI3 save-adjustment).
import { Router } from 'express';
import {
  payrollAdjustmentSchema,
  payrollFileExportQuerySchema,
  payrollFileListQuerySchema,
  type MutationResult,
  type PayrollFileRow,
} from '@attendance/shared';
import { requireAuth } from '../../auth/middleware';
import type { CsvExport } from '../../lib/csv';
import { body } from '../http';
import { reportRoutes } from '../report';
import type { PayrollFileRepository } from './repository';

/** CI3 export_payroll_file: the values exactly as the list returned them. */
export const PAYROLL_FILE_EXPORT: CsvExport<PayrollFileRow> = {
  filePrefix: 'payroll_file_data',
  emptyMessage: 'No payroll file data found to export.',
  columns: [
    { label: 'Emp No', value: (r) => r.empNo },
    { label: 'Emp Name', value: (r) => r.empName },
    { label: 'Late', value: (r) => r.late },
    { label: 'Early', value: (r) => r.early },
    { label: 'Total Delay', value: (r) => r.totDelay },
    { label: 'Overtime Hours', value: (r) => r.overtimeHrs },
    { label: 'Absence WO', value: (r) => r.absenceWo },
  ],
};

export function payrollFileRoutes(deps: { payroll: PayrollFileRepository }): Router {
  const router = Router();
  router.use(
    reportRoutes({
      path: '/payroll-file',
      listSchema: payrollFileListQuerySchema,
      repository: deps.payroll,
      csv: { ...PAYROLL_FILE_EXPORT, exportSchema: payrollFileExportQuerySchema },
    }),
  );

  router.post('/payroll-file/adjustment', requireAuth, async (req, res) => {
    await deps.payroll.saveAdjustment(body(payrollAdjustmentSchema, req));
    const result: MutationResult = { message: 'Payroll adjustment saved successfully.' };
    res.json(result);
  });

  return router;
}
