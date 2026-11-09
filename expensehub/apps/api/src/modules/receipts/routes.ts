// Implements: API §4 receipts — upload (Own), file (Own, Step, Fin after canViewReceipt).
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authOf, canViewReceipt, requireAuth } from '../../auth/rbac';
import type { AppConfig } from '../../config';
import type { DataLayer } from '../../data/ports';
import { AppError } from '../../lib/errors';
import type { ReceiptService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function receiptRoutes({
  config,
  data,
  receipts,
}: {
  config: AppConfig;
  data: DataLayer;
  receipts: ReceiptService;
}): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.receipts.maxUploadBytes, files: 1, fields: 5 },
  }).single('file');

  router.post('/receipts', requireAuth, upload, async (req, res) => {
    if (!req.file) throw new AppError('VALIDATION', 'Choose a receipt file to upload.');
    const result = await receipts.upload(authOf(req).personId, req.file);
    res.status(201).json(result);
  });

  router.get('/receipts/:id/file', requireAuth, async (req, res) => {
    const auth = authOf(req);
    const { id } = idParam.parse(req.params);
    const receipt = await data.read(async (r) => {
      const row = await r.receipts.get(id);
      if (!row) return undefined;
      const expense = row.expenseId ? await r.expenses.get(row.expenseId) : undefined;
      const report = expense?.reportId ? await r.reports.get(expense.reportId) : undefined;
      const steps = report ? await r.approvalSteps.listByReport(report.reportId) : [];
      return canViewReceipt(auth, row, report, steps) ? row : undefined;
    });
    // Not found and not allowed look the same (no probing of receipt ids).
    if (!receipt) throw new AppError('NOT_FOUND', 'Receipt not found');
    res.set({
      'Content-Type': receipt.mime,
      'Content-Disposition': `inline; filename="${encodeURIComponent(receipt.originalName)}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    res.sendFile(receipts.absolutePath(receipt));
  });

  return router;
}
