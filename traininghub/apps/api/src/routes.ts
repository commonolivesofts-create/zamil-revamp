// REST API v1. Thin: parse input with the shared zod schemas, call a domain service, return JSON.
import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  ELIGIBILITY_RULES,
  ROLES,
  SETTINGS,
  assessmentInput,
  attendanceInput,
  bulkApproveInput,
  categoryInput,
  changePasswordInput,
  decisionInput,
  delegationInput,
  employeePositionInput,
  examInput,
  examSubmitInput,
  loginInput,
  positionCopyInput,
  positionDecisionInput,
  positionInput,
  positionSkillInput,
  positionSkillReplaceInput,
  practicalInput,
  questionInput,
  requestCreateInput,
  resetPasswordInput,
  roleInput,
  ruleInput,
  sessionInput,
  settingsInput,
  skillInput,
  withdrawInput,
  workflowInput,
  type EligibilityRuleCode,
} from '@traininghub/shared';
import { changePassword, login, sessionMiddleware } from './auth/auth';
import * as admin from './domain/admin';
import { directory, hasRole, settings as loadSettings } from './domain/ctx';
import { eligibility, loadRules, saveRule } from './domain/eligibility';
import * as insight from './domain/insight';
import * as jsm from './domain/positions';
import { personSkills, saveAssessment } from './domain/profiles';
import * as requests from './domain/requests';
import * as sessions from './domain/sessions';
import * as training from './domain/training';
import { getWorkflow, saveWorkflow, workflowWarnings } from './domain/workflow';
import { syncEmployees, syncRuns } from './integrations/fusion/sync';
import { AppError, forbidden } from './lib/errors';
import { body, intParam, q } from './lib/http';
import { DEMO_PERSONAS } from './seed/seed';
import type { Services } from './services';

export function apiRouter(svc: Services): Router {
  const r = Router();
  const ctx = (req: Request) => req.ctx;
  const requireHr = async (req: Request) => {
    if (!hasRole(await directory(req.ctx), req.personId!, 'HR_ADMIN')) throw forbidden('HR administrators only');
  };

  /* ------------------------------ public ------------------------------ */
  r.get('/health', (_req, res) => {
    res.json({ ok: true, data: svc.config.data.mode, fusion: svc.config.fusion.mode });
  });
  r.get('/auth/config', (_req, res) => {
    res.json({ quickLogin: svc.config.auth.quickLogin, dataMode: svc.config.data.mode, fusionMode: svc.config.fusion.mode });
  });
  r.get('/auth/quick-list', async (req, res) => {
    if (!svc.config.auth.quickLogin) throw forbidden();
    const dir = await directory(ctx(req));
    const needle = q(req, 'q').toLowerCase();
    const pick = needle
      ? [...dir.people.values()].filter((p) => p.active && `${p.fullName} ${p.personNumber}`.toLowerCase().includes(needle)).slice(0, 20)
      : [
          ...DEMO_PERSONAS.map(([id]) => dir.people.get(id)).filter((p) => p?.active),
          ...svc.config.bootstrapAdmins.map((n) => dir.byNumber.get(n)).filter((p) => p?.active),
        ];
    const seen = new Set<number>();
    res.json(
      pick
        .filter((p) => p && !seen.has(p.personId) && seen.add(p.personId))
        .map((p) => ({
          personId: p!.personId,
          personNumber: p!.personNumber,
          fullName: p!.fullName,
          jobName: p!.jobName,
          hint: DEMO_PERSONAS.find(([id]) => id === p!.personId)?.[1] ?? p!.roles.join(', '),
        })),
    );
  });
  const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
  r.post('/auth/login', loginLimit, async (req, res) => {
    const input = body(loginInput, req);
    const s = await login(svc, ctx(req), input.personNumber, input.password);
    await svc.sessions.issue(res, { personId: s.personId, ph: s.ph });
    res.json({ ok: true, mustChangePassword: s.mustChange });
  });
  r.post('/auth/quick', async (req, res) => {
    if (!svc.config.auth.quickLogin || svc.config.isProduction) throw forbidden('Quick sign-in is disabled');
    const { personId } = body(z.object({ personId: z.coerce.number().int().positive() }), req);
    const p = (await directory(ctx(req))).people.get(personId);
    if (!p?.active) throw new AppError('UNAUTHENTICATED', 'Unknown or inactive employee');
    await svc.sessions.issue(res, { personId, ph: 'quick' });
    res.json({ ok: true });
  });
  r.post('/auth/logout', (_req, res) => {
    svc.sessions.clear(res);
    res.json({ ok: true });
  });

  /* ------------------------------ signed in ------------------------------ */
  r.use(sessionMiddleware(svc));

  r.post('/auth/change-password', async (req, res) => {
    const input = body(changePasswordInput, req);
    const ph = await changePassword(svc, ctx(req), req.personId!, input.currentPassword, input.newPassword);
    await svc.sessions.issue(res, { personId: req.personId!, ph });
    res.json({ ok: true });
  });
  r.get('/me', async (req, res) => {
    res.json(await insight.me(ctx(req), !!req.mustChangePassword));
  });
  r.get('/notifications', async (req, res) => {
    res.json(await admin.myNotifications(ctx(req)));
  });
  r.post('/notifications/read', async (req, res) => {
    const { id } = body(z.object({ id: z.coerce.number().int().positive().optional() }), req);
    await admin.markRead(ctx(req), id);
    res.json({ ok: true });
  });
  r.get('/lookups', async (req, res) => {
    const c = ctx(req);
    const dir = await directory(c);
    const [lib, positions] = await Promise.all([admin.library(c), c.store.find('positions', {}, { orderBy: ['name'] })]);
    res.json({
      categories: lib.categories,
      skills: lib.skills,
      positions: positions.map((p) => ({ id: p.id, name: p.name, grade: p.grade, status: p.statusCode, versionNo: p.versionNo, ownerPersonId: p.ownerPersonId })),
      people: [...dir.people.values()]
        .filter((p) => p.active)
        .map((p) => ({ personId: p.personId, personNumber: p.personNumber, fullName: p.fullName, positionId: p.positionId, managerId: p.managerId, jobName: p.jobName })),
      roles: ROLES,
    });
  });

  /* ------------------------------ catalog & sessions ------------------------------ */
  r.get('/sessions', async (req, res) => {
    res.json(await sessions.listSessions(ctx(req), { from: q(req, 'from') || undefined, to: q(req, 'to') || undefined }));
  });
  r.get('/catalog', async (req, res) => {
    const c = ctx(req);
    const personId = Number(q(req, 'personId')) || req.personId!;
    const list = (await sessions.listSessions(c, { from: q(req, 'from') || undefined })).filter((s) => s.status === 'SCHEDULED');
    const rules = await loadRules(c);
    const dir = await directory(c);
    const canCheck = dir.people.get(personId)?.positionId != null || personId === req.personId;
    const out = [];
    for (const s of list) out.push({ ...s, eligibility: canCheck ? await eligibility(c, personId, s.id, { rules }) : null });
    res.json(out);
  });
  r.get('/sessions/:id', async (req, res) => {
    res.json(await sessions.getSession(ctx(req), intParam(req, 'id')));
  });
  r.get('/sessions/:id/eligibility', async (req, res) => {
    const personId = Number(q(req, 'personId')) || req.personId!;
    res.json(await eligibility(ctx(req), personId, intParam(req, 'id')));
  });
  r.post('/sessions', async (req, res) => {
    res.status(201).json(await sessions.createSession(ctx(req), body(sessionInput, req)));
  });
  r.put('/sessions/:id', async (req, res) => {
    await sessions.updateSession(ctx(req), intParam(req, 'id'), body(sessionInput, req));
    res.json(await sessions.getSession(ctx(req), intParam(req, 'id')));
  });
  r.post('/sessions/:id/cancel', async (req, res) => {
    const { comment } = body(z.object({ comment: z.string().trim().max(500) }), req);
    res.json(await sessions.cancelSession(ctx(req), intParam(req, 'id'), comment));
  });

  /* ------------------------------ requests & approvals ------------------------------ */
  r.post('/requests', async (req, res) => {
    res.status(201).json(await requests.submitRequest(ctx(req), body(requestCreateInput, req)));
  });
  r.get('/requests', async (req, res) => {
    const scope = (q(req, 'scope') || 'mine') as 'mine' | 'team' | 'all';
    if (!['mine', 'team', 'all'].includes(scope)) throw new AppError('VALIDATION', 'Bad scope');
    res.json(await requests.listRequests(ctx(req), scope));
  });
  r.get('/requests/:id', async (req, res) => {
    res.json(await requests.getRequest(ctx(req), intParam(req, 'id')));
  });
  r.post('/requests/:id/withdraw', async (req, res) => {
    res.json(await requests.withdraw(ctx(req), intParam(req, 'id'), body(withdrawInput, req).comment));
  });
  r.post('/requests/:id/decision', async (req, res) => {
    res.json(await requests.decide(ctx(req), intParam(req, 'id'), body(decisionInput, req)));
  });
  r.post('/requests/bulk-approve', async (req, res) => {
    res.json(await requests.bulkApprove(ctx(req), body(bulkApproveInput, req).ids));
  });
  r.get('/approvals', async (req, res) => {
    res.json(await requests.inbox(ctx(req)));
  });

  /* ------------------------------ skills ------------------------------ */
  r.get('/skills/me', async (req, res) => {
    res.json(await personSkills(ctx(req), req.personId!));
  });
  r.get('/skills/person/:id', async (req, res) => {
    res.json(await personSkills(ctx(req), intParam(req, 'id')));
  });
  r.post('/skills/assess', async (req, res) => {
    const input = body(assessmentInput, req);
    res.json(await saveAssessment(ctx(req), input.personId, input.levels, input.note));
  });
  r.get('/team', async (req, res) => {
    res.json(await insight.team(ctx(req)));
  });
  r.get('/gaps', async (req, res) => {
    res.json(await insight.gaps(ctx(req), Number(q(req, 'positionId')) || undefined));
  });

  /* ------------------------------ Job Skills Matrix ------------------------------ */
  r.get('/positions', async (req, res) => {
    res.json(await jsm.listPositions(ctx(req)));
  });
  r.get('/positions/:id', async (req, res) => {
    res.json(await jsm.getPosition(ctx(req), intParam(req, 'id')));
  });
  r.post('/positions', async (req, res) => {
    const p = await jsm.createPosition(ctx(req), body(positionInput, req));
    res.status(201).json(await jsm.getPosition(ctx(req), p.id));
  });
  r.put('/positions/:id', async (req, res) => {
    await jsm.updatePosition(ctx(req), intParam(req, 'id'), body(positionInput, req));
    res.json(await jsm.getPosition(ctx(req), intParam(req, 'id')));
  });
  r.delete('/positions/:id', async (req, res) => {
    await jsm.deletePosition(ctx(req), intParam(req, 'id'));
    res.json({ ok: true });
  });
  r.post('/positions/:id/skills', async (req, res) => {
    await jsm.addSkill(ctx(req), intParam(req, 'id'), body(positionSkillInput, req));
    res.status(201).json(await jsm.getPosition(ctx(req), intParam(req, 'id')));
  });
  r.put('/positions/:id/skills/:skillId', async (req, res) => {
    const input = positionSkillInput.parse({ ...req.body, skillId: req.params.skillId });
    await jsm.updateSkill(ctx(req), intParam(req, 'id'), input);
    res.json(await jsm.getPosition(ctx(req), intParam(req, 'id')));
  });
  r.delete('/positions/:id/skills/:skillId', async (req, res) => {
    await jsm.removeSkill(ctx(req), intParam(req, 'id'), intParam(req, 'skillId'));
    res.json(await jsm.getPosition(ctx(req), intParam(req, 'id')));
  });
  r.post('/positions/:id/skills/replace', async (req, res) => {
    await jsm.replaceSkill(ctx(req), intParam(req, 'id'), body(positionSkillReplaceInput, req));
    res.json(await jsm.getPosition(ctx(req), intParam(req, 'id')));
  });
  r.post('/positions/:id/copy', async (req, res) => {
    const input = body(positionCopyInput, req);
    await jsm.copyProfile(ctx(req), intParam(req, 'id'), input.fromPositionId, input.mode);
    res.json(await jsm.getPosition(ctx(req), intParam(req, 'id')));
  });
  r.post('/positions/:id/submit', async (req, res) => {
    await jsm.submitPosition(ctx(req), intParam(req, 'id'));
    res.json(await jsm.getPosition(ctx(req), intParam(req, 'id')));
  });
  r.post('/positions/:id/decision', async (req, res) => {
    const input = body(positionDecisionInput, req);
    await jsm.decidePosition(ctx(req), intParam(req, 'id'), input.action, input.comment);
    res.json(await jsm.getPosition(ctx(req), intParam(req, 'id')));
  });
  r.get('/matrix', async (req, res) => {
    res.json(await insight.matrix(ctx(req)));
  });
  r.get('/jobs', async (req, res) => {
    res.json(await jsm.jobMapping(ctx(req)));
  });
  r.put('/jobs', async (req, res) => {
    const input = body(z.object({ jobName: z.string().trim().min(1).max(240), positionId: z.coerce.number().int().positive().nullable() }), req);
    await jsm.mapJob(ctx(req), input.jobName, input.positionId);
    res.json(await jsm.jobMapping(ctx(req)));
  });
  r.post('/jobs/import', async (req, res) => {
    const { jobNames } = body(z.object({ jobNames: z.array(z.string()).optional() }), req);
    res.json(await jsm.importJobsAsPositions(ctx(req), jobNames));
  });

  /* ------------------------------ skills library ------------------------------ */
  r.get('/library', async (req, res) => {
    res.json(await admin.library(ctx(req)));
  });
  r.post('/library/categories', async (req, res) => {
    await admin.saveCategory(ctx(req), body(categoryInput, req));
    res.status(201).json(await admin.library(ctx(req)));
  });
  r.put('/library/categories/:id', async (req, res) => {
    await admin.saveCategory(ctx(req), body(categoryInput, req), intParam(req, 'id'));
    res.json(await admin.library(ctx(req)));
  });
  r.delete('/library/categories/:id', async (req, res) => {
    await admin.deleteCategory(ctx(req), intParam(req, 'id'));
    res.json(await admin.library(ctx(req)));
  });
  r.post('/library/skills', async (req, res) => {
    await admin.saveSkill(ctx(req), body(skillInput, req));
    res.status(201).json(await admin.library(ctx(req)));
  });
  r.put('/library/skills/:id', async (req, res) => {
    await admin.saveSkill(ctx(req), body(skillInput, req), intParam(req, 'id'));
    res.json(await admin.library(ctx(req)));
  });
  r.delete('/library/skills/:id', async (req, res) => {
    await admin.deleteSkill(ctx(req), intParam(req, 'id'));
    res.json(await admin.library(ctx(req)));
  });

  /* ------------------------------ trainer ------------------------------ */
  r.get('/trainer/sessions', async (req, res) => {
    res.json(await training.trainerSessions(ctx(req)));
  });
  r.get('/trainer/sessions/:id/roster', async (req, res) => {
    res.json(await training.roster(ctx(req), intParam(req, 'id')));
  });
  r.put('/trainer/sessions/:id/attendance', async (req, res) => {
    await training.saveAttendance(ctx(req), intParam(req, 'id'), body(attendanceInput, req).marks);
    res.json(await training.roster(ctx(req), intParam(req, 'id')));
  });
  r.post('/trainer/sessions/:id/lock', async (req, res) => {
    res.json(await training.lockAttendance(ctx(req), intParam(req, 'id')));
  });
  r.get('/trainer/sessions/:id/exam', async (req, res) => {
    res.json(await training.getExam(ctx(req), intParam(req, 'id')));
  });
  r.post('/trainer/sessions/:id/exam', async (req, res) => {
    res.status(201).json(await training.createExam(ctx(req), intParam(req, 'id')));
  });
  r.put('/trainer/sessions/:id/exam', async (req, res) => {
    res.json(await training.updateExam(ctx(req), intParam(req, 'id'), body(examInput, req)));
  });
  r.post('/trainer/sessions/:id/exam/questions', async (req, res) => {
    res.status(201).json(await training.saveQuestion(ctx(req), intParam(req, 'id'), body(questionInput, req)));
  });
  r.put('/trainer/sessions/:id/exam/questions/:qid', async (req, res) => {
    res.json(await training.saveQuestion(ctx(req), intParam(req, 'id'), body(questionInput, req), intParam(req, 'qid')));
  });
  r.delete('/trainer/sessions/:id/exam/questions/:qid', async (req, res) => {
    res.json(await training.deleteQuestion(ctx(req), intParam(req, 'id'), intParam(req, 'qid')));
  });
  r.post('/trainer/sessions/:id/exam/publish', async (req, res) => {
    const { publish } = body(z.object({ publish: z.boolean() }), req);
    res.json(await training.publishExam(ctx(req), intParam(req, 'id'), publish));
  });
  r.put('/trainer/sessions/:id/practical', async (req, res) => {
    await training.savePractical(ctx(req), intParam(req, 'id'), body(practicalInput, req).marks);
    res.json(await training.roster(ctx(req), intParam(req, 'id')));
  });
  r.post('/trainer/sessions/:id/release', async (req, res) => {
    const { force } = body(z.object({ force: z.boolean().default(false) }), req);
    res.json(await training.releaseResults(ctx(req), intParam(req, 'id'), force));
  });
  r.get('/assessments', async (req, res) => {
    res.json(await training.myAssessments(ctx(req)));
  });
  r.post('/assessments/:sessionId/submit', async (req, res) => {
    res.json(await training.submitExam(ctx(req), intParam(req, 'sessionId'), body(examSubmitInput, req).answers));
  });

  /* ------------------------------ setup ------------------------------ */
  r.get('/setup/rules', async (req, res) => {
    res.json(await loadRules(ctx(req)));
  });
  r.put('/setup/rules/:code', async (req, res) => {
    await requireHr(req);
    const code = req.params.code as EligibilityRuleCode;
    if (!(code in ELIGIBILITY_RULES)) throw new AppError('NOT_FOUND', 'Unknown rule');
    await saveRule(ctx(req), code, body(ruleInput, req));
    res.json(await loadRules(ctx(req)));
  });
  r.get('/setup/settings', async (req, res) => {
    res.json({ definitions: SETTINGS, values: await loadSettings(ctx(req)) });
  });
  r.put('/setup/settings', async (req, res) => {
    await admin.saveSettings(ctx(req), body(settingsInput, req).values);
    res.json({ definitions: SETTINGS, values: await loadSettings(ctx(req)) });
  });
  r.get('/setup/workflow', async (req, res) => {
    res.json({ steps: await getWorkflow(ctx(req)), warnings: await workflowWarnings(ctx(req)) });
  });
  r.put('/setup/workflow', async (req, res) => {
    await saveWorkflow(ctx(req), body(workflowInput, req).steps);
    res.json({ steps: await getWorkflow(ctx(req)), warnings: await workflowWarnings(ctx(req)) });
  });
  r.get('/delegations', async (req, res) => {
    const all = q(req, 'all') === '1' && hasRole(await directory(ctx(req)), req.personId!, 'HR_ADMIN');
    res.json(await admin.listDelegations(ctx(req), all));
  });
  r.post('/delegations', async (req, res) => {
    await admin.createDelegation(ctx(req), body(delegationInput, req));
    res.status(201).json(await admin.listDelegations(ctx(req), false));
  });
  r.delete('/delegations/:id', async (req, res) => {
    await admin.cancelDelegation(ctx(req), intParam(req, 'id'));
    res.json({ ok: true });
  });
  r.get('/setup/employees', async (req, res) => {
    await requireHr(req);
    res.json(await admin.listEmployees(ctx(req), q(req, 'q'), q(req, 'inactive') === '1'));
  });
  r.put('/setup/employees/:id/position', async (req, res) => {
    await jsm.setEmployeePosition(ctx(req), intParam(req, 'id'), body(employeePositionInput, req).positionId);
    res.json({ ok: true });
  });
  r.post('/setup/roles', async (req, res) => {
    const input = body(roleInput, req);
    await admin.grantRole(ctx(req), input.personId, input.role);
    res.json({ ok: true });
  });
  r.post('/setup/roles/revoke', async (req, res) => {
    const input = body(roleInput, req);
    await admin.revokeRole(ctx(req), input.personId, input.role);
    res.json({ ok: true });
  });
  r.post('/setup/users/reset-password', async (req, res) => {
    res.json(await admin.resetPassword(ctx(req), body(resetPasswordInput, req).personId));
  });

  /* ------------------------------ integration, reports, audit ------------------------------ */
  r.get('/integration/status', async (req, res) => {
    await requireHr(req);
    const c = ctx(req);
    const [runs, total, active] = await Promise.all([syncRuns(c), c.store.count('employees'), c.store.count('employees', { activeFlag: true })]);
    res.json({
      fusionMode: svc.config.fusion.mode,
      dataMode: svc.config.data.mode,
      fusionUrl: svc.config.fusion.baseUrl ?? null,
      employeeReport: svc.config.fusion.employeeReport,
      fallbackReport: svc.config.fusion.employeeReportFallback,
      syncHour: svc.config.fusion.syncHour,
      employees: { total, active },
      runs,
    });
  });
  r.post('/integration/sync', async (req, res) => {
    await requireHr(req);
    const { force } = body(z.object({ force: z.boolean().default(false) }), req);
    res.json(await syncEmployees(ctx(req), svc.employees, { force }));
  });
  r.get('/reports', async (req, res) => {
    res.json(await insight.reports(ctx(req)));
  });
  r.get('/reports/requests.csv', async (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="training-requests.csv"');
    res.send('﻿' + (await insight.requestsCsv(ctx(req))));
  });
  r.get('/audit', async (req, res) => {
    res.json(await admin.auditLog(ctx(req), q(req, 'q')));
  });

  return r;
}
