// Occasions: POST /occasions/list, /occasions/export, POST /occasions, PUT/DELETE /occasions/:id.
import { Router } from 'express';
import {
  occasionExportQuerySchema,
  occasionInputSchema,
  occasionListQuerySchema,
  type OccasionFilters,
  type OccasionRow,
} from '@attendance/shared';
import type { Request } from 'express';
import { authOf, requireAuth } from '../../auth/middleware';
import { dash, dMY, dMYTime, yesNo, type CsvExport } from '../../lib/csv';
import { body, idParam } from '../http';
import { reportRoutes, type ReportRepository } from '../report';
import type { OccasionRepository } from './repository';

const NOT_FOUND = 'Occasion not found.';

/** CI3 export: the 22 keys of Occasion::serializeOccasion, in order, with its formats. */
export const OCCASION_EXPORT: CsvExport<OccasionRow> = {
  filePrefix: 'occasion_data',
  emptyMessage: 'No occasion data found to export.',
  columns: [
    { label: 'occasion_id', value: (r) => r.occasionId },
    { label: 'occasion_name', value: (r) => r.occasionName },
    { label: 'from_date', value: (r) => r.fromDate },
    { label: 'to_date', value: (r) => r.toDate },
    { label: 'shift_id', value: (r) => r.shiftIds.join(',') },
    { label: 'shift_names', value: (r) => dash(r.shiftNames) },
    { label: 'occasion_type', value: (r) => r.occasionType },
    { label: 'count_as_present', value: (r) => r.countAsPresent },
    { label: 'paid_holiday', value: (r) => r.paidHoliday },
    { label: 'is_active', value: (r) => r.isActive },
    { label: 'remarks', value: (r) => r.remarks },
    { label: 'created_by', value: (r) => r.createdBy },
    { label: 'created_at', value: (r) => dMYTime(r.createdAt) },
    { label: 'updated_by', value: (r) => r.updatedBy },
    { label: 'updated_at', value: (r) => dMYTime(r.updatedAt) },
    { label: 'from_date_display', value: (r) => dash(dMY(r.fromDate)) },
    { label: 'to_date_display', value: (r) => dash(dMY(r.toDate)) },
    { label: 'occasion_type_display', value: (r) => dash(r.occasionType) },
    { label: 'count_as_present_display', value: (r) => yesNo(r.countAsPresent) },
    { label: 'paid_holiday_display', value: (r) => yesNo(r.paidHoliday) },
    { label: 'is_active_display', value: (r) => yesNo(r.isActive) },
    { label: 'remarks_display', value: (r) => dash(r.remarks) },
  ],
};

/** CREATED_BY / UPDATED_BY: user name, else user id (what CI3 meant to write; it wrote SYSTEM). */
const author = (req: Request) => {
  const auth = authOf(req);
  return auth.userName || String(auth.userId);
};

export function occasionRoutes(deps: {
  occasions: OccasionRepository;
  list: ReportRepository<OccasionFilters, OccasionRow>;
}): Router {
  const router = Router();

  router.use(
    reportRoutes({
      path: '/occasions',
      listSchema: occasionListQuerySchema,
      repository: deps.list,
      csv: { ...OCCASION_EXPORT, exportSchema: occasionExportQuerySchema },
    }),
  );

  router.post('/occasions', requireAuth, async (req, res) => {
    const input = body(occasionInputSchema, req);
    const occasion = await deps.occasions.insert(input, author(req));
    res.status(201).json({ message: 'Occasion added successfully.', occasion });
  });

  router.put('/occasions/:id', requireAuth, async (req, res) => {
    const id = idParam(req, NOT_FOUND);
    const input = body(occasionInputSchema, req);
    const occasion = await deps.occasions.update(id, input, author(req));
    res.json({ message: 'Occasion updated successfully.', occasion });
  });

  router.delete('/occasions/:id', requireAuth, async (req, res) => {
    await deps.occasions.remove(idParam(req, NOT_FOUND));
    res.json({ message: 'Occasion deleted successfully.' });
  });

  return router;
}
