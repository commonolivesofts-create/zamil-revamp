// Occasions: POST /occasions/list, /occasions/export, POST /occasions, PUT/DELETE /occasions/:id.
import { Router } from 'express';
import {
  OCCASION_EXPORT_COLUMNS,
  occasionExportQuerySchema,
  occasionInputSchema,
  occasionListQuerySchema,
  type OccasionFilters,
  type OccasionRow,
} from '@attendance/shared';
import { authOf, requirePermission } from '../../auth/middleware';
import { body, idParam } from '../http';
import { reportRoutes, type ReportRepository } from '../report';
import type { OccasionRepository } from './repository';

const NOT_FOUND = 'Occasion not found.';

export function occasionRoutes(deps: {
  occasions: OccasionRepository;
  list: ReportRepository<OccasionFilters, OccasionRow>;
}): Router {
  const router = Router();
  const manage = requirePermission('setup:manage');

  router.use(
    reportRoutes({
      path: '/occasions',
      permission: 'setup:view',
      listSchema: occasionListQuerySchema,
      repository: deps.list,
      csv: {
        exportSchema: occasionExportQuerySchema,
        columns: OCCASION_EXPORT_COLUMNS,
        filePrefix: 'occasion_data',
      },
    }),
  );

  // CREATED_BY / UPDATED_BY record the employee number (CI3 always wrote 'SYSTEM').
  router.post('/occasions', manage, async (req, res) => {
    const input = body(occasionInputSchema, req);
    const occasion = await deps.occasions.insert(input, authOf(req).employeeNumber);
    res.status(201).json({ message: 'Occasion added successfully.', occasion });
  });

  router.put('/occasions/:id', manage, async (req, res) => {
    const id = idParam(req, NOT_FOUND);
    const input = body(occasionInputSchema, req);
    const occasion = await deps.occasions.update(id, input, authOf(req).employeeNumber);
    res.json({ message: 'Occasion updated successfully.', occasion });
  });

  router.delete('/occasions/:id', manage, async (req, res) => {
    await deps.occasions.remove(idParam(req, NOT_FOUND));
    res.json({ message: 'Occasion deleted successfully.' });
  });

  return router;
}
