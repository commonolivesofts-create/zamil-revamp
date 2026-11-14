// Implements: API §10 setup endpoints (Adm) and the FR-SET-02 report (Adm, Fin for their BUs).
import {
  APPROVAL_CHAINS,
  AUDIT_RULE_CODES,
  BUSINESS_UNITS,
  approvalRuleCreateSchema,
  approvalRuleUpdateSchema,
  auditRuleUpdateSchema,
  expenseTypeCreateSchema,
  expenseTypeUpdateSchema,
  prerequisitesQuerySchema,
  roleAssignmentCreateSchema,
  systemOptionUpdateSchema,
  type PrerequisitesResponse,
} from '@expensehub/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, financeBusinessUnits, hasRole, requireCapability } from '../../auth/rbac';
import type { DataLayer } from '../../data/ports';
import { checkPrerequisites } from '../../domain/prerequisites';
import { riyadhDate, type Clock } from '../../lib/dates';
import {
  approvalRuleDto,
  auditRuleDto,
  expenseTypeDto,
  roleAssignmentDto,
  systemOptionDto,
} from './dto';
import type { SetupService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const optionParams = z.object({
  key: z.string().min(1).max(60),
  bu: z.union([z.literal('*'), z.enum(BUSINESS_UNITS)]),
});
const auditCodeParam = z.object({ code: z.enum(AUDIT_RULE_CODES) });

export function setupRoutes({
  data,
  setup,
  clock,
}: {
  data: DataLayer;
  setup: SetupService;
  clock: Clock;
}): Router {
  const router = Router();
  const admin = requireCapability('SYS_ADMIN');

  // ─── FR-SET-02 prerequisites ──────────────────────────────────────────────
  router.get(
    '/setup/prerequisites',
    requireCapability('SYS_ADMIN', 'FINANCE_AP', 'ACCOUNTANT'),
    async (req, res) => {
      const auth = authOf(req);
      const query = prerequisitesQuerySchema.parse(req.query);
      const visible = hasRole(auth, 'SYS_ADMIN') ? [...BUSINESS_UNITS] : financeBusinessUnits(auth);
      const units = query.bu ? visible.filter((bu) => bu === query.bu) : visible;

      const items = await data.read(async (r) => {
        const ceoIds = new Set(
          (await r.roleAssignments.listByRole('APPROVER_CEO')).map((a) => a.personId),
        );
        return (await r.employees.list())
          .filter((e) => e.active === 'Y' && units.includes(e.businessUnit))
          .map((e) => ({
            personId: e.personId,
            personNumber: e.personNumber,
            fullName: e.fullName,
            businessUnit: e.businessUnit,
            jobName: e.jobName,
            ...checkPrerequisites(e, { needsLineManager: !ceoIds.has(e.personId) }),
          }))
          .filter((item) => !query.failingOnly || !item.ok)
          .sort((a, b) => a.personNumber.localeCompare(b.personNumber));
      });
      const body: PrerequisitesResponse = { items };
      res.json(body);
    },
  );

  // ─── Expense types (FR-POL-01) ────────────────────────────────────────────
  router.get('/setup/expense-types', admin, async (_req, res) => {
    const rows = await data.read((r) => r.expenseTypes.list());
    res.json({ items: rows.map(expenseTypeDto) });
  });

  router.post('/setup/expense-types', admin, async (req, res) => {
    const input = expenseTypeCreateSchema.parse(req.body);
    const row = await setup.createExpenseType(input, authOf(req).personId);
    res.status(201).json(expenseTypeDto(row));
  });

  router.patch('/setup/expense-types/:id', admin, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const input = expenseTypeUpdateSchema.parse(req.body);
    res.json(expenseTypeDto(await setup.updateExpenseType(id, input, authOf(req).personId)));
  });

  // ─── System options (FR-SET-01) ───────────────────────────────────────────
  router.get('/setup/options', admin, async (_req, res) => {
    const rows = await data.read((r) => r.systemOptions.list());
    rows.sort(
      (a, b) =>
        a.optionKey.localeCompare(b.optionKey) || a.businessUnit.localeCompare(b.businessUnit),
    );
    res.json({ items: rows.map(systemOptionDto) });
  });

  router.patch('/setup/options/:key/:bu', admin, async (req, res) => {
    const { key, bu } = optionParams.parse(req.params);
    const { optionValue, version } = systemOptionUpdateSchema.parse(req.body);
    const row = await setup.updateOption(
      { optionKey: key, businessUnit: bu },
      optionValue,
      version,
      authOf(req).personId,
    );
    res.json(systemOptionDto(row));
  });

  // ─── Approval rules (FR-APR-01) ───────────────────────────────────────────
  router.get('/setup/approval-rules', admin, async (_req, res) => {
    const rows = await data.read((r) => r.approvalRules.list());
    rows.sort(
      (a, b) =>
        APPROVAL_CHAINS.indexOf(a.chainCode) - APPROVAL_CHAINS.indexOf(b.chainCode) ||
        a.seq - b.seq,
    );
    res.json({ items: rows.map(approvalRuleDto) });
  });

  router.post('/setup/approval-rules', admin, async (req, res) => {
    const input = approvalRuleCreateSchema.parse(req.body);
    res
      .status(201)
      .json(approvalRuleDto(await setup.createApprovalRule(input, authOf(req).personId)));
  });

  router.patch('/setup/approval-rules/:id', admin, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const input = approvalRuleUpdateSchema.parse(req.body);
    res.json(approvalRuleDto(await setup.updateApprovalRule(id, input, authOf(req).personId)));
  });

  // ─── Audit rules (FR-AUD-01) ──────────────────────────────────────────────
  router.get('/setup/audit-rules', admin, async (_req, res) => {
    const rows = await data.read((r) => r.auditRules.list());
    rows.sort(
      (a, b) => AUDIT_RULE_CODES.indexOf(a.ruleCode) - AUDIT_RULE_CODES.indexOf(b.ruleCode),
    );
    res.json({ items: rows.map(auditRuleDto) });
  });

  router.patch('/setup/audit-rules/:code', admin, async (req, res) => {
    const { code } = auditCodeParam.parse(req.params);
    const input = auditRuleUpdateSchema.parse(req.body);
    res.json(auditRuleDto(await setup.updateAuditRule(code, input, authOf(req).personId)));
  });

  // ─── Role assignments (FR-SET-04) ─────────────────────────────────────────
  router.get('/setup/role-assignments', admin, async (_req, res) => {
    const today = riyadhDate(clock());
    const items = await data.read(async (r) => {
      const rows = await r.roleAssignments.list();
      const out = [];
      for (const row of rows)
        out.push(roleAssignmentDto(row, await r.employees.get(row.personId), today));
      return out.sort(
        (a, b) => a.roleCode.localeCompare(b.roleCode) || a.fullName.localeCompare(b.fullName),
      );
    });
    res.json({ items });
  });

  router.post('/setup/role-assignments', admin, async (req, res) => {
    const input = roleAssignmentCreateSchema.parse(req.body);
    const row = await setup.createRoleAssignment(input, authOf(req).personId);
    const employee = await data.read((r) => r.employees.get(row.personId));
    res.status(201).json(roleAssignmentDto(row, employee, riyadhDate(clock())));
  });

  router.delete('/setup/role-assignments/:id', admin, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const row = await setup.endRoleAssignment(id, authOf(req).personId);
    const employee = await data.read((r) => r.employees.get(row.personId));
    res.json(roleAssignmentDto(row, employee, riyadhDate(clock())));
  });

  return router;
}
