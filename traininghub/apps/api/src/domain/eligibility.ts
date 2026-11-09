// One rule set used by the catalog, the request wizard, nominations and the approval inbox.
// Every rule lives in TH_ELIGIBILITY_RULES: HR can switch it off, make it a warning or a block,
// tune its parameter and replace its message (Setup → Eligibility).
import {
  ACTIVE_STATUSES,
  ELIGIBILITY_RULES,
  type Eligibility,
  type EligibilityIssue,
  type EligibilityRuleCode,
  type EligibilityRule,
  type RequestStatus,
  type RuleSeverity,
} from '@traininghub/shared';
import type { R } from '../db/tables';
import { daysBetween } from '../lib/dates';
import { notFound } from '../lib/errors';
import { directory, nowIso, today, type Ctx } from './ctx';
import { effectiveProfile, levelsOf } from './profiles';
import { overlaps, sar, seatsTaken } from './sessions';

interface RuleDefault {
  enabled: boolean;
  severity: RuleSeverity;
  param: number | null;
}
export const RULE_DEFAULTS: Record<EligibilityRuleCode, RuleDefault> = {
  EMPLOYEE_ACTIVE: { enabled: true, severity: 'BLOCK', param: null },
  POSITION_MAPPED: { enabled: true, severity: 'BLOCK', param: null },
  PROFILE_APPROVED: { enabled: true, severity: 'BLOCK', param: null },
  MANAGER_REQUIRED: { enabled: true, severity: 'BLOCK', param: null },
  CUTOFF_DAYS: { enabled: true, severity: 'BLOCK', param: 1 },
  SKILL_IN_PROFILE: { enabled: true, severity: 'BLOCK', param: null },
  EXTERNAL_OUTSIDE_PROFILE: { enabled: true, severity: 'WARN', param: null },
  BELOW_TARGET: { enabled: true, severity: 'BLOCK', param: null },
  LEVEL_BAND: { enabled: true, severity: 'BLOCK', param: null },
  DUPLICATE_REQUEST: { enabled: true, severity: 'BLOCK', param: null },
  SAME_SKILL_ACTIVE: { enabled: true, severity: 'WARN', param: null },
  TIME_CLASH: { enabled: true, severity: 'BLOCK', param: null },
  TRAINER_SELF: { enabled: true, severity: 'BLOCK', param: null },
  YEARLY_LIMIT: { enabled: true, severity: 'BLOCK', param: 4 },
  YEARLY_COST_CAP: { enabled: false, severity: 'WARN', param: 20000 },
  SEATS_FULL: { enabled: true, severity: 'WARN', param: null },
  REASON_MIN_LENGTH: { enabled: true, severity: 'BLOCK', param: 15 },
  REASON_MIN_LENGTH_PAID: { enabled: true, severity: 'BLOCK', param: 40 },
};
export const RULE_ORDER = Object.keys(ELIGIBILITY_RULES) as EligibilityRuleCode[];

export async function loadRules(ctx: Ctx): Promise<EligibilityRule[]> {
  const rows = new Map((await ctx.store.find('rules')).map((r) => [r.ruleCode, r]));
  return RULE_ORDER.map((code, i) => {
    const r = rows.get(code);
    const d = RULE_DEFAULTS[code];
    return {
      code,
      label: ELIGIBILITY_RULES[code].label,
      enabled: r ? r.enabledFlag : d.enabled,
      severity: (r?.severity as RuleSeverity) ?? d.severity,
      paramValue: r ? r.paramValue : d.param,
      paramLabel: ELIGIBILITY_RULES[code].param,
      message: r?.message ?? '',
      sortOrder: r?.sortOrder ?? i,
    };
  });
}

export async function saveRule(
  ctx: Ctx,
  code: EligibilityRuleCode,
  input: { enabled: boolean; severity: RuleSeverity; paramValue: number | null; message: string },
) {
  const d = RULE_DEFAULTS[code];
  if (!d) throw notFound('Rule');
  await ctx.store.upsert('rules', ['ruleCode'], {
    ruleCode: code,
    enabledFlag: input.enabled,
    severity: input.severity,
    paramValue: ELIGIBILITY_RULES[code].param ? (input.paramValue ?? d.param) : null,
    message: input.message || null,
    sortOrder: RULE_ORDER.indexOf(code),
    updatedBy: ctx.actor,
    updatedAt: nowIso(ctx),
  });
}

const YEAR_CLOSED: RequestStatus[] = ['REJECTED', 'WITHDRAWN'];

export interface EligibilityOptions {
  ignoreRequestId?: number;
  /** Pre-loaded rules, to evaluate many sessions at once. */
  rules?: EligibilityRule[];
}

export async function eligibility(
  ctx: Ctx,
  personId: number,
  sessionId: number,
  opts: EligibilityOptions = {},
): Promise<Eligibility> {
  const dir = await directory(ctx);
  const session = await ctx.store.one('sessions', { id: sessionId });
  if (!session) throw notFound('Session');
  const rules = new Map((opts.rules ?? (await loadRules(ctx))).map((r) => [r.code, r]));
  const errors: EligibilityIssue[] = [];
  const warnings: EligibilityIssue[] = [];
  const rule = (code: EligibilityRuleCode) => rules.get(code)!;
  const param = (code: EligibilityRuleCode) =>
    Number(rule(code).paramValue ?? RULE_DEFAULTS[code].param ?? 0);
  const fail = (code: EligibilityRuleCode, message: string) => {
    const r = rule(code);
    if (!r.enabled) return;
    const issue = { code, severity: r.severity, message: r.message || message };
    (r.severity === 'BLOCK' ? errors : warnings).push(issue);
  };
  const hard = (message: string) => errors.push({ code: 'CUTOFF_DAYS', severity: 'BLOCK', message });

  const person = dir.people.get(personId);
  const skills = await ctx.store.find('skills', { id: session.skillId });
  const skillName = skills[0]?.name ?? 'This skill';
  const base = { currentLevel: 0, requirement: null, targetLevel: 0 } as const;
  const minReasonFor = () =>
    session.costHalalas > 0 && rule('REASON_MIN_LENGTH_PAID').enabled
      ? param('REASON_MIN_LENGTH_PAID')
      : rule('REASON_MIN_LENGTH').enabled
        ? param('REASON_MIN_LENGTH')
        : 1;

  if (!person)
    return {
      ok: false,
      errors: [{ code: 'EMPLOYEE_ACTIVE', severity: 'BLOCK', message: 'Unknown employee' }],
      warnings,
      ...base,
      minReason: 1,
      willWaitlist: false,
    };
  if (session.statusCode === 'CANCELLED') hard('This session has been cancelled.');
  const t = today(ctx);
  if (session.startDate < t) hard('This session has already started.');
  else {
    const days = param('CUTOFF_DAYS');
    if (daysBetween(t, session.startDate) < days)
      fail(
        'CUTOFF_DAYS',
        days <= 1
          ? 'Requests close the day before the session starts.'
          : `Requests close ${days} days before the session starts.`,
      );
  }
  if (!person.active) fail('EMPLOYEE_ACTIVE', `${person.fullName} is not active in Fusion.`);
  if (!person.managerId || !dir.people.get(person.managerId)?.active)
    fail('MANAGER_REQUIRED', `${person.fullName} has no active direct manager in Fusion.`);
  if (session.trainerPersonId === personId)
    fail('TRAINER_SELF', 'The trainer cannot request their own session.');

  const pos = person.positionId ? dir.positions.get(person.positionId) : undefined;
  let currentLevel = 0;
  let requirement: Eligibility['requirement'] = null;
  let targetLevel = 0;
  const levels = await levelsOf(ctx, personId);
  currentLevel = levels.get(session.skillId)?.skillLevel ?? 0;
  if (!pos)
    fail('POSITION_MAPPED', `${person.fullName} is not mapped to a position in the Job Skills Matrix.`);
  else {
    if (pos.versionNo === 0)
      fail(
        'PROFILE_APPROVED',
        `The ${pos.name} skill profile has never been approved — HR must approve it first.`,
      );
    const need = (await effectiveProfile(ctx, pos)).get(session.skillId);
    requirement = need?.requirement ?? null;
    targetLevel = need?.targetLevel ?? 0;
    if (!need || need.requirement === 'U') {
      if (session.sessionType === 'EXTERNAL')
        fail(
          'EXTERNAL_OUTSIDE_PROFILE',
          `${skillName} is not required for ${pos.name} — a strong business reason is needed.`,
        );
      else fail('SKILL_IN_PROFILE', `${skillName} is not part of the ${pos.name} profile.`);
    } else if (currentLevel >= need.targetLevel)
      fail('BELOW_TARGET', `Already at target level (L${currentLevel} of L${need.targetLevel}).`);
  }
  if (currentLevel < session.bandFrom || currentLevel > session.bandTo)
    fail(
      'LEVEL_BAND',
      `Current level L${currentLevel} is outside this session's band (L${session.bandFrom}–L${session.bandTo}).`,
    );

  const mine = (await ctx.store.find('requests', { personId })).filter((r) => r.id !== opts.ignoreRequestId);
  const active = mine.filter((r) => ACTIVE_STATUSES.includes(r.statusCode as RequestStatus));
  const activeSessions = active.length
    ? await ctx.store.find('sessions', { id: [...new Set(active.map((r) => r.sessionId))] })
    : [];
  const sesOf = (r: R<'requests'>) => activeSessions.find((s) => s.id === r.sessionId);
  if (active.some((r) => r.sessionId === sessionId))
    fail('DUPLICATE_REQUEST', 'There is already an active request for this session.');
  else if (active.some((r) => sesOf(r)?.skillId === session.skillId))
    fail('SAME_SKILL_ACTIVE', 'Another active request exists for the same skill.');
  const clash = active.find((r) => r.sessionId !== sessionId && sesOf(r) && overlaps(sesOf(r)!, session));
  if (clash) {
    const c = sesOf(clash)!;
    fail(
      'TIME_CLASH',
      `Clashes with ${c.title} (${c.startDate}${c.endDate !== c.startDate ? ` – ${c.endDate}` : ''}).`,
    );
  }

  const year = t.slice(0, 4);
  const thisYear = mine.filter(
    (r) => r.createdAt.slice(0, 4) === year && !YEAR_CLOSED.includes(r.statusCode as RequestStatus),
  );
  const limit = pos?.requestLimit ?? param('YEARLY_LIMIT');
  if (thisYear.length >= limit)
    fail('YEARLY_LIMIT', `Request limit reached (${thisYear.length} of ${limit} for ${year}).`);
  if (session.costHalalas > 0 && rule('YEARLY_COST_CAP').enabled) {
    const yearSessions = thisYear.length
      ? await ctx.store.find('sessions', { id: [...new Set(thisYear.map((r) => r.sessionId))] })
      : [];
    const spent = thisYear.reduce(
      (a, r) => a + (yearSessions.find((s) => s.id === r.sessionId)?.costHalalas ?? 0),
      0,
    );
    const cap = param('YEARLY_COST_CAP');
    if (sar(spent + session.costHalalas) > cap)
      fail(
        'YEARLY_COST_CAP',
        `External spend would reach SAR ${sar(spent + session.costHalalas).toLocaleString()} (cap SAR ${cap.toLocaleString()}).`,
      );
  }

  const taken = seatsTaken(session, await ctx.store.find('requests', { sessionId }));
  const willWaitlist = taken >= session.capacity;
  if (willWaitlist)
    fail('SEATS_FULL', 'Session is full — the request will join the waitlist after approval.');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    currentLevel,
    requirement,
    targetLevel,
    minReason: minReasonFor(),
    willWaitlist,
  };
}
