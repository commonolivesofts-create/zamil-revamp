// Implements: API §4 expenses (Own in M4; Step / Fin read access arrives with reports in M5).
import { expenseInputSchema, expenseUpdateSchema, expenseValidateSchema } from '@expensehub/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth } from '../../auth/rbac';
import type { ExpenseRow } from '../../data/entities';
import type { DataLayer, Repos } from '../../data/ports';
import { evaluationDto, toExpenseDto } from './dto';
import type { ExpenseService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({ unreported: z.stringbool().optional() });

const toDto = (r: Repos, row: ExpenseRow) => toExpenseDto(r, row);

export function expenseRoutes({
  data,
  expenses,
}: {
  data: DataLayer;
  expenses: ExpenseService;
}): Router {
  const router = Router();

  router.get('/expenses', requireAuth, async (req, res) => {
    const { personId } = authOf(req);
    // ?unreported=true is the only list until reports exist (M5 adds lines on reports).
    listQuery.parse(req.query);
    const items = await data.read(async (r) => {
      const rows = await r.expenses.listUnreported(personId);
      return Promise.all(rows.map((row) => toDto(r, row)));
    });
    res.json({ items });
  });

  // Dry run for the live checklist (FR-POL-02). Declared before /:id.
  router.post('/expenses/validate', requireAuth, async (req, res) => {
    const { expenseId, ...input } = expenseValidateSchema.parse(req.body);
    const evaluated = await expenses.validate(authOf(req).personId, input, expenseId ?? null);
    res.json(evaluationDto(evaluated));
  });

  router.post('/expenses', requireAuth, async (req, res) => {
    const input = expenseInputSchema.parse(req.body);
    const row = await expenses.create(authOf(req).personId, input);
    res.status(201).json(await data.read((r) => toDto(r, row)));
  });

  router.get('/expenses/:id', requireAuth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const row = await expenses.get(authOf(req).personId, id);
    res.json(await data.read((r) => toDto(r, row)));
  });

  router.patch('/expenses/:id', requireAuth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const input = expenseUpdateSchema.parse(req.body);
    const row = await expenses.update(authOf(req).personId, id, input);
    res.json(await data.read((r) => toDto(r, row)));
  });

  router.delete('/expenses/:id', requireAuth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    await expenses.delete(authOf(req).personId, id);
    res.status(204).end();
  });

  return router;
}
