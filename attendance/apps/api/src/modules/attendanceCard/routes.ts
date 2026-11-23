// Attendance Card: POST /attendance-card/list, /attendance-card/export,
// POST /attendance-card/upload (multipart: file, mode=preview|import).
import { Router } from 'express';
import multer from 'multer';
import {
  attendanceCardExportQuerySchema,
  attendanceCardListQuerySchema,
  UPLOAD_MAX_BYTES,
  UPLOAD_PREVIEW_LIMIT,
  type AttendanceCardFilters,
  type AttendanceCardRow,
  type UploadImport,
  type UploadPreview,
} from '@attendance/shared';
import { requireAuth } from '../../auth/middleware';
import { dash, dMY, type CsvExport } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import { reportRoutes, type ReportRepository } from '../report';
import { parseAttendanceRows, readSheet } from './fileParser';
import type { AttendanceImporter } from './repository';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
});

/** CI3 export: readable headers, dates as d M Y, '-' for missing values. */
export const ATTENDANCE_CARD_EXPORT: CsvExport<AttendanceCardRow> = {
  filePrefix: 'attendance_card_data',
  emptyMessage: 'No attendance card data found to export.',
  columns: [
    { label: 'Employee Number', value: (r) => r.empNo },
    { label: 'Employee Name', value: (r) => r.empName },
    { label: 'Attendance Date', value: (r) => dash(dMY(r.attDate)) },
    { label: 'Punch In', value: (r) => dash(r.punchIn) },
    { label: 'Punch Out', value: (r) => dash(r.punchOut) },
  ],
};

export function attendanceCardRoutes(deps: {
  list: ReportRepository<AttendanceCardFilters, AttendanceCardRow>;
  importer: AttendanceImporter;
}): Router {
  const router = Router();

  router.use(
    reportRoutes({
      path: '/attendance-card',
      listSchema: attendanceCardListQuerySchema,
      repository: deps.list,
      csv: { ...ATTENDANCE_CARD_EXPORT, exportSchema: attendanceCardExportQuerySchema },
    }),
  );

  router.post('/attendance-card/upload', requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file)
      throw new AppError('VALIDATION', 'Please select an attendance CSV or XLSX file.');
    const mode = req.body?.mode === 'import' ? 'import' : 'preview';
    const parsed = parseAttendanceRows(await readSheet(req.file.buffer, req.file.originalname));

    if (mode === 'preview') {
      const preview: UploadPreview = {
        message: 'Attendance file validated successfully.',
        summary: {
          totalDataRows: parsed.totalDataRows,
          validRows: parsed.valid.length,
          invalidRows: parsed.errors.length,
        },
        rows: parsed.valid.slice(0, UPLOAD_PREVIEW_LIMIT),
        errors: parsed.errors.slice(0, UPLOAD_PREVIEW_LIMIT),
      };
      res.json(preview);
      return;
    }

    if (parsed.valid.length === 0) {
      throw new AppError('VALIDATION', 'No valid attendance rows were found.', {
        validationErrors: parsed.errors.slice(0, UPLOAD_PREVIEW_LIMIT),
      });
    }
    const outcome = await deps.importer.importRows(parsed.valid);
    const result: UploadImport = {
      message: 'Attendance file imported successfully.',
      totalRows: parsed.valid.length,
      insertedRows: outcome.insertedRows,
      updatedRows: outcome.updatedRows,
      skippedRows: outcome.skipped.length,
      skipped: outcome.skipped.slice(0, UPLOAD_PREVIEW_LIMIT),
      invalidRows: parsed.errors.length,
      validationErrors: parsed.errors.slice(0, UPLOAD_PREVIEW_LIMIT),
    };
    res.json(result);
  });

  return router;
}
