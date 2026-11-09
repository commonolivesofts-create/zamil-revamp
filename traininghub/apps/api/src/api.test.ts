import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';
import { MemoryStore } from './db/memory';
import { createLogger } from './lib/logger';
import { createServices, type Services } from './services';
import { seedDemo } from './seed/seed';

const NOW = new Date('2026-11-06T06:00:00.000Z');
const H = { 'X-Requested-With': 'TrainingHub' };

let svc: Services;
let app: ReturnType<typeof createApp>;
let clock = NOW;

async function as(personId: number) {
  const agent = request.agent(app);
  const r = await agent.post('/api/v1/auth/quick').set(H).send({ personId });
  expect(r.status).toBe(200);
  return {
    get: (url: string) => agent.get(`/api/v1${url}`),
    post: (url: string, body: unknown = {}) =>
      agent
        .post(`/api/v1${url}`)
        .set(H)
        .send(body as object),
    put: (url: string, body: unknown = {}) =>
      agent
        .put(`/api/v1${url}`)
        .set(H)
        .send(body as object),
    del: (url: string) => agent.delete(`/api/v1${url}`).set(H),
  };
}

beforeEach(async () => {
  clock = NOW;
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'x'.repeat(40),
    BCRYPT_COST: '4',
    INITIAL_PASSWORD: 'Welcome-2026',
  });
  const store = new MemoryStore(null);
  svc = createServices(config, createLogger(config), { store, clock: () => clock });
  await seedDemo(store, NOW);
  app = createApp(svc);
});

const sessionId = async (title: string) => (await svc.store.one('sessions', { title }))!.id;
const skillId = async (name: string) => (await svc.store.one('skills', { name }))!.id;
const positionId = async (name: string) => (await svc.store.one('positions', { name }))!.id;

describe('auth', () => {
  it('rejects requests without a session and mutating calls without the app header', async () => {
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/quick').send({ personId: 2333 })).status).toBe(403);
  });
  it('signs in with the initial password and forces a change', async () => {
    const agent = request.agent(app);
    const bad = await agent
      .post('/api/v1/auth/login')
      .set(H)
      .send({ personNumber: '2333', password: 'nope' });
    expect(bad.status).toBe(401);
    const ok = await agent
      .post('/api/v1/auth/login')
      .set(H)
      .send({ personNumber: '2333', password: 'Welcome-2026' });
    expect(ok.body.mustChangePassword).toBe(true);
    expect((await agent.get('/api/v1/requests')).status).toBe(403);
    const ch = await agent
      .post('/api/v1/auth/change-password')
      .set(H)
      .send({ currentPassword: 'Welcome-2026', newPassword: 'Better-pass-2026' });
    expect(ch.status).toBe(200);
    expect((await agent.get('/api/v1/requests')).status).toBe(200);
  });
});

describe('job skills matrix — add / update / replace / remove (correction 1)', () => {
  it('lets the owner edit a profile and puts it back to draft while the approved version stays in force', async () => {
    const zaid = await as(2172);
    const pid = await positionId('Database Administrator');
    const before = (await zaid.get(`/positions/${pid}`)).body;
    expect(before.status).toBe('APPROVED');
    const ai = await skillId('AI and machine learning');
    const add = await zaid.post(`/positions/${pid}/skills`, {
      skillId: ai,
      requirement: 'O',
      targetLevel: 2,
      critical: false,
    });
    expect(add.status).toBe(201);
    expect(add.body.status).toBe('DRAFT');
    expect(add.body.draftChanged).toBe(true);
    expect(add.body.skills.some((s: { skillId: number }) => s.skillId === ai)).toBe(true);
    expect(add.body.approvedSkills.some((s: { skillId: number }) => s.skillId === ai)).toBe(false);

    const dup = await zaid.post(`/positions/${pid}/skills`, {
      skillId: ai,
      requirement: 'R',
      targetLevel: 2,
    });
    expect(dup.status).toBe(409);

    const upd = await zaid.put(`/positions/${pid}/skills/${ai}`, {
      requirement: 'R',
      targetLevel: 3,
      critical: true,
    });
    expect(upd.body.skills.find((s: { skillId: number }) => s.skillId === ai)).toMatchObject({
      requirement: 'R',
      targetLevel: 3,
      critical: true,
    });

    const rpa = await skillId('Automation / RPA');
    const already = (await zaid.get(`/positions/${pid}`)).body.skills.some(
      (s: { skillId: number }) => s.skillId === rpa,
    );
    const target = already ? await skillId('Low-code (Oracle APEX)') : rpa;
    const rep = await zaid.post(`/positions/${pid}/skills/replace`, { fromSkillId: ai, toSkillId: target });
    expect(rep.status).toBe(200);
    const swapped = rep.body.skills.find((s: { skillId: number }) => s.skillId === target);
    expect(swapped).toMatchObject({ requirement: 'R', targetLevel: 3 });
    expect(rep.body.skills.some((s: { skillId: number }) => s.skillId === ai)).toBe(false);

    const rem = await zaid.del(`/positions/${pid}/skills/${target}`);
    expect(rem.body.skills.some((s: { skillId: number }) => s.skillId === target)).toBe(false);

    // Not the owner, not HR → forbidden.
    const ahmed = await as(2333);
    expect(
      (await ahmed.post(`/positions/${pid}/skills`, { skillId: ai, requirement: 'O', targetLevel: 1 }))
        .status,
    ).toBe(403);
  });

  it('validates on submit and HR approval creates the next version', async () => {
    const zaid = await as(2172);
    const noura = await as(1190);
    const pid = await positionId('Database Administrator');
    const ai = await skillId('AI and machine learning');
    await zaid.post(`/positions/${pid}/skills`, { skillId: ai, requirement: 'O', targetLevel: 2 });
    const sub = await zaid.post(`/positions/${pid}/submit`);
    expect(sub.body.status).toBe('PENDING');
    const ret = await noura.post(`/positions/${pid}/decision`, { action: 'return', comment: 'x' });
    expect(ret.status).toBe(400);
    const ok = await noura.post(`/positions/${pid}/decision`, { action: 'approve' });
    expect(ok.body).toMatchObject({ status: 'APPROVED', versionNo: 4, draftChanged: false });

    // A mandatory HSE skill cannot be removed and submitted.
    const fa = await skillId('Basic of First Aid');
    await zaid.del(`/positions/${pid}/skills/${fa}`);
    const bad = await zaid.post(`/positions/${pid}/submit`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.errors.join(' ')).toContain('mandatory');
  });
});

describe('eligibility is configurable (correction 2)', () => {
  it('blocks, then allows when HR turns the rule off or makes it a warning', async () => {
    const ahmed = await as(2333);
    const noura = await as(1190);
    const sid = await sessionId('Agile & Scrum in Practice');
    const e1 = (await ahmed.get(`/sessions/${sid}/eligibility`)).body;
    // Agile is not in the Oracle Applications Lead profile → blocked.
    expect(e1.ok).toBe(false);
    expect(e1.errors.map((e: { code: string }) => e.code)).toContain('SKILL_IN_PROFILE');

    await noura.put('/setup/rules/SKILL_IN_PROFILE', { enabled: true, severity: 'WARN', paramValue: null });
    const e2 = (await ahmed.get(`/sessions/${sid}/eligibility`)).body;
    expect(e2.errors.map((e: { code: string }) => e.code)).not.toContain('SKILL_IN_PROFILE');
    expect(e2.warnings.map((e: { code: string }) => e.code)).toContain('SKILL_IN_PROFILE');

    await noura.put('/setup/rules/YEARLY_LIMIT', { enabled: true, severity: 'BLOCK', paramValue: 1 });
    const e3 = (await ahmed.get(`/sessions/${sid}/eligibility`)).body;
    expect(e3.errors.find((e: { code: string }) => e.code === 'YEARLY_LIMIT')?.message).toMatch(
      /limit reached/,
    );

    // Employees cannot change rules.
    expect((await ahmed.put('/setup/rules/YEARLY_LIMIT', { enabled: false, severity: 'BLOCK' })).status).toBe(
      403,
    );
  });
});

describe('workflow: Direct manager → HR Lead, editable (correction 3)', () => {
  it('routes a request to the manager then to any HR Lead, and the waitlist / seat logic applies', async () => {
    const karthik = await as(2381);
    const sid = await sessionId('Power BI for Finance & IT');
    const wf = (await (await as(1190)).get('/setup/workflow')).body;
    expect(wf.steps.map((s: { label: string }) => s.label)).toEqual(['Direct manager', 'HR Lead']);

    // Karthik (DBA) — Power BI is not in his profile; make the request possible for the test.
    await (await as(1190)).put('/setup/rules/SKILL_IN_PROFILE', { enabled: false, severity: 'BLOCK' });
    await (await as(1190)).put('/setup/rules/BELOW_TARGET', { enabled: false, severity: 'BLOCK' });
    await (await as(1190)).put('/setup/rules/LEVEL_BAND', { enabled: false, severity: 'BLOCK' });
    const sub = await karthik.post('/requests', { personId: 2381, sessionId: sid, reason: 'Short' });
    expect(sub.status).toBe(400);
    const ok = await karthik.post('/requests', {
      personId: 2381,
      sessionId: sid,
      reason: 'Dashboards for DB capacity planning.',
    });
    expect(ok.status).toBe(201);
    const req = ok.body;
    expect(req.steps.map((s: { label: string; status: string }) => `${s.label}:${s.status}`)).toEqual([
      'Direct manager:PENDING',
      'HR Lead:WAITING',
    ]);
    expect(req.steps[0].approverName).toBe('Zaid Sayyed');

    const reem = await as(2514);
    expect((await reem.post(`/requests/${req.id}/decision`, { action: 'approve' })).status).toBe(409);
    const zaid = await as(2172);
    const a1 = await zaid.post(`/requests/${req.id}/decision`, { action: 'approve', comment: 'ok' });
    expect(a1.body.steps[1].status).toBe('PENDING');
    // Either HR Lead (Reem or Noura) can act.
    const inbox = (await reem.get('/approvals')).body.waiting.map((r: { id: number }) => r.id);
    expect(inbox).toContain(req.id);
    const a2 = await reem.post(`/requests/${req.id}/decision`, { action: 'approve' });
    expect(a2.body.status).toBe('APPROVED');
  });

  it('applies an edited workflow to new requests (finance step above a cost)', async () => {
    const noura = await as(1190);
    const save = await noura.put('/setup/workflow', {
      steps: [
        { label: 'Direct manager', approverType: 'DIRECT_MANAGER' },
        {
          label: 'Finance',
          approverType: 'ROLE',
          roleCode: 'FINANCE',
          conditionType: 'COST_ABOVE',
          conditionValue: 5000,
        },
        { label: 'HR Lead', approverType: 'ROLE', roleCode: 'HR_LEAD' },
      ],
    });
    expect(save.status).toBe(200);
    const sid = await sessionId('Oracle Integration Cloud Essentials'); // SAR 6,500
    const priya = await as(2418);
    await noura.put('/setup/rules/SKILL_IN_PROFILE', { enabled: false, severity: 'BLOCK' });
    await noura.put('/setup/rules/EXTERNAL_OUTSIDE_PROFILE', { enabled: false, severity: 'WARN' });
    await noura.put('/setup/rules/LEVEL_BAND', { enabled: false, severity: 'BLOCK' });
    await noura.put('/setup/rules/BELOW_TARGET', { enabled: false, severity: 'BLOCK' });
    const r = await priya.post('/requests', {
      personId: 2418,
      sessionId: sid,
      reason: 'Interfaces between Fusion and the WMS need an owner in the functional team.',
    });
    expect(r.status).toBe(201);
    expect(r.body.steps.map((s: { label: string }) => s.label)).toEqual([
      'Direct manager',
      'Finance',
      'HR Lead',
    ]);
  });

  it('honours delegation and lets the requester withdraw', async () => {
    const zaid = await as(2172);
    await zaid.post('/delegations', {
      toPersonId: 2201,
      startDate: '2026-11-06',
      endDate: '2026-11-10',
      reason: 'Leave',
    });
    const noura = await as(1190);
    await noura.put('/setup/rules/SKILL_IN_PROFILE', { enabled: false, severity: 'BLOCK' });
    await noura.put('/setup/rules/LEVEL_BAND', { enabled: false, severity: 'BLOCK' });
    await noura.put('/setup/rules/BELOW_TARGET', { enabled: false, severity: 'BLOCK' });
    const yusuf = await as(2501);
    const sid = await sessionId('Cybersecurity Essentials for IT');
    const r = (
      await yusuf.post('/requests', {
        personId: 2501,
        sessionId: sid,
        reason: 'Secure coding for our internal apps.',
      })
    ).body;
    expect(r.steps[0]).toMatchObject({ approverName: 'Rashid Al-Dossary', delegatedFromName: 'Zaid Sayyed' });
    const w = await yusuf.post(`/requests/${r.id}/withdraw`, {});
    expect(w.body.status).toBe('WITHDRAWN');
  });
});

describe('trainer flow', () => {
  it('locks attendance, takes the exam, releases results and raises the skill level', async () => {
    const imran = await as(2377);
    const sid = await sessionId('Fusion BIP & OTBI Reporting');
    const roster = (await imran.get(`/trainer/sessions/${sid}/roster`)).body;
    expect(roster.rows).toHaveLength(4);
    expect((await imran.post(`/trainer/sessions/${sid}/lock`)).status).toBe(409);
    const marks = Object.fromEntries(
      roster.rows.map((r: { personId: number }) => [r.personId, r.personId === 2418 ? 'ABSENT' : 'PRESENT']),
    );
    await imran.put(`/trainer/sessions/${sid}/attendance`, { marks });
    expect((await imran.post(`/trainer/sessions/${sid}/lock`)).body).toEqual({ attended: 3, total: 4 });

    const ahmed = await as(2333);
    const mine = (await ahmed.get('/assessments')).body.find(
      (a: { session: { id: number } }) => a.session.id === sid,
    );
    expect(mine.state).toBe('open');
    expect(mine.questions[0].correctIndex).toBeUndefined();
    const sub = await ahmed.post(`/assessments/${sid}/submit`, { answers: [1, 1, 1, 0, 0] });
    expect(sub.body.theory).toBe(100);
    const lina = await as(2340);
    await lina.post(`/assessments/${sid}/submit`, { answers: [0, 0, 0, 0, 0] });

    const rel1 = await imran.post(`/trainer/sessions/${sid}/release`, {});
    expect(rel1.status).toBe(400); // practical marks missing
    await imran.put(`/trainer/sessions/${sid}/practical`, { marks: { 2333: 8, 2340: 9, 2410: 7 } });
    const rel2 = await imran.post(`/trainer/sessions/${sid}/release`, {});
    expect(rel2.status).toBe(409);
    expect(rel2.body.error.details.confirm).toBe(true);
    const rel3 = await imran.post(`/trainer/sessions/${sid}/release`, { force: true });
    expect(rel3.body).toEqual({ passed: 1, total: 3 });

    const skills = (await ahmed.get('/skills/me')).body;
    const fusionSkill = await skillId('Cloud Fusion SaaS');
    const bip = skills.rows.find((r: { skillId: number }) => r.skillId === fusionSkill);
    expect(bip.currentLevel).toBe(2);
    expect(skills.history[0]).toMatchObject({ fromLevel: 1, toLevel: 2, source: 'TRAINING' });
  });
});

describe('positions & employees mapping', () => {
  it('maps a Fusion job to a position and overrides one employee', async () => {
    const noura = await as(1190);
    const jobs = (await noura.get('/jobs')).body;
    const hr = jobs.find((j: { jobName: string }) => j.jobName === 'HR Supervisor');
    expect(hr.positionId).toBeNull();
    const imp = await noura.post('/jobs/import', { jobNames: ['HR Supervisor'] });
    expect(imp.body.created).toBe(1);
    const pid = await positionId('Data Analyst');
    expect((await noura.put('/setup/employees/2507/position', { positionId: pid })).status).toBe(200);
    const emp = (await noura.get('/setup/employees?q=Hana')).body[0];
    expect(emp).toMatchObject({ positionName: 'Data Analyst', positionSource: 'OVERRIDE' });
  });
});

describe('reports & sync', () => {
  it('computes reports and syncs employees from (mock) Fusion with the drop guard', async () => {
    const noura = await as(1190);
    const rep = (await noura.get('/reports')).body;
    expect(rep.kpis.requests).toBeGreaterThan(5);
    expect(rep.demand.length).toBeGreaterThan(0);
    const sync = (await noura.post('/integration/sync', {})).body;
    expect(sync.statusCode).toBe('SUCCESS');
    expect(sync.updated).toBe(0);
    const csv = await noura.get('/reports/requests.csv');
    expect(csv.text).toContain('"Request","Person number"');
  });
});
