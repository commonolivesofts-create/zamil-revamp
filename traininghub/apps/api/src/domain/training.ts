// Trainer workspace: attendance, exams (theory MCQ + practical mark), results release,
// and the learner's assessments. Released passes raise the employee's skill level.
import type { AttendanceMark, Exam, MyAssessment, Question, RequestStatus, RosterRow } from '@traininghub/shared';
import type { R } from '../db/tables';
import { AppError, forbidden, invalid, notFound, validation } from '../lib/errors';
import {
  audit,
  directory,
  hasRole,
  nameOf,
  notify,
  nowIso,
  settingFlag,
  settingInt,
  settings,
  today,
  type Ctx,
  type Directory,
} from './ctx';
import { effectiveProfile, personRef, setLevel } from './profiles';
import { sessionLookups, toSession } from './sessions';

const ROSTER: RequestStatus[] = ['APPROVED', 'ATTENDED', 'NO_SHOW', 'COMPLETED', 'NOT_PASSED'];

async function trainerSession(ctx: Ctx, sessionId: number) {
  const dir = await directory(ctx);
  const s = await ctx.store.one('sessions', { id: sessionId });
  if (!s) throw notFound('Session');
  if (s.trainerPersonId !== ctx.actor && !hasRole(dir, ctx.actor!, 'HR_ADMIN'))
    throw forbidden('Only the trainer or HR can manage this session');
  return { dir, s };
}

export async function trainerSessions(ctx: Ctx) {
  const dir = await directory(ctx);
  const hr = hasRole(dir, ctx.actor!, 'HR_ADMIN');
  const rows = (await ctx.store.find('sessions', hr ? {} : { trainerPersonId: ctx.actor }, { orderBy: ['startDate'] })).filter(
    (s) => s.statusCode === 'SCHEDULED',
  );
  const L = await sessionLookups(ctx);
  return rows.map((s) => ({
    ...toSession(s, L),
    learners: L.requests.filter((r) => r.sessionId === s.id && ROSTER.includes(r.statusCode as RequestStatus)).length,
  }));
}

async function examOf(ctx: Ctx, sessionId: number) {
  return ctx.store.one('exams', { sessionId });
}

export async function roster(ctx: Ctx, sessionId: number): Promise<{ session: ReturnType<typeof toSession>; rows: RosterRow[]; canMark: boolean }> {
  const { dir, s } = await trainerSession(ctx, sessionId);
  const reqs = (await ctx.store.find('requests', { sessionId })).filter((r) => ROSTER.includes(r.statusCode as RequestStatus));
  const marks = new Map((await ctx.store.find('attendance', { sessionId })).map((a) => [a.personId, a.markCode as AttendanceMark]));
  const exam = await examOf(ctx, sessionId);
  const results = new Map(exam ? (await ctx.store.find('examResults', { examId: exam.id })).map((x) => [x.personId, x]) : []);
  const rows = reqs
    .map((r) => {
      const res = results.get(r.personId);
      return {
        requestId: r.id,
        requestNo: r.requestNo ?? '',
        personId: r.personId,
        personName: nameOf(dir, r.personId) ?? '',
        positionName: personRef(dir, r.personId).positionName,
        status: r.statusCode as RequestStatus,
        mark: marks.get(r.personId) ?? null,
        theory: res?.theoryScore ?? null,
        submittedAt: res?.submittedAt ?? null,
        practical: res?.practicalScore ?? null,
        passed: res?.releasedFlag ? res.passedFlag : null,
      };
    })
    .sort((a, b) => a.personName.localeCompare(b.personName));
  const L = await sessionLookups(ctx, [sessionId]);
  return { session: toSession(s, L), rows, canMark: s.startDate <= today(ctx) && !s.attendanceLockedAt };
}

export async function saveAttendance(ctx: Ctx, sessionId: number, marks: Record<string, AttendanceMark>) {
  const { s } = await trainerSession(ctx, sessionId);
  if (s.startDate > today(ctx)) throw invalid(`Attendance opens on ${s.startDate}`);
  if (s.attendanceLockedAt) throw invalid('Attendance is locked');
  const learners = new Set(
    (await ctx.store.find('requests', { sessionId, statusCode: 'APPROVED' })).map((r) => r.personId),
  );
  await ctx.store.tx(async () => {
    for (const [k, mark] of Object.entries(marks)) {
      const personId = Number(k);
      if (!learners.has(personId)) throw validation(`#${personId} is not on this roster`);
      await ctx.store.upsert('attendance', ['sessionId', 'personId'], {
        sessionId,
        personId,
        markCode: mark,
        markedBy: ctx.actor,
        markedAt: nowIso(ctx),
      });
    }
  });
}

async function raiseLevel(ctx: Ctx, dir: Directory, personId: number, session: R<'sessions'>, requestId: number) {
  const s = await settings(ctx);
  const cur = (await ctx.store.one('employeeSkills', { personId, skillId: session.skillId }))?.skillLevel ?? 0;
  let next = Math.min(4, cur + Math.max(0, settingInt(s, 'LEVEL_RAISE_ON_PASS')));
  if (settingFlag(s, 'LEVEL_CAP_AT_TARGET')) {
    const p = dir.people.get(personId);
    const pos = p?.positionId ? dir.positions.get(p.positionId) : undefined;
    const target = pos ? ((await effectiveProfile(ctx, pos)).get(session.skillId)?.targetLevel ?? 0) : 0;
    if (target) next = Math.min(next, Math.max(cur, target));
  }
  if (next !== cur) await setLevel(ctx, personId, session.skillId, next, 'TRAINING', requestId, session.title);
  return next;
}

export async function lockAttendance(ctx: Ctx, sessionId: number) {
  const { dir, s } = await trainerSession(ctx, sessionId);
  if (s.startDate > today(ctx)) throw invalid(`Attendance opens on ${s.startDate}`);
  if (s.attendanceLockedAt) throw invalid('Attendance is already locked');
  const reqs = await ctx.store.find('requests', { sessionId, statusCode: 'APPROVED' });
  const marks = new Map((await ctx.store.find('attendance', { sessionId })).map((a) => [a.personId, a.markCode]));
  const missing = reqs.filter((r) => !marks.has(r.personId));
  if (missing.length) throw invalid(`Mark all learners first — ${missing.length} missing`);
  const exam = await examOf(ctx, sessionId);
  const st = await settings(ctx);
  let attended = 0;
  await ctx.store.tx(async () => {
    const at = nowIso(ctx);
    for (const r of reqs) {
      const present = marks.get(r.personId) !== 'ABSENT';
      let status: RequestStatus = present ? 'ATTENDED' : 'NO_SHOW';
      if (present) attended++;
      if (present && !exam) {
        status = 'COMPLETED';
        if (settingFlag(st, 'NO_EXAM_RAISES_LEVEL')) await raiseLevel(ctx, dir, r.personId, s, r.id);
      }
      await ctx.store.update('requests', { id: r.id }, { statusCode: status, updatedAt: at });
      if (present && exam?.statusCode === 'PUBLISHED')
        await notify(ctx, r.personId, `The ${s.title} test is open — take it in Assessments`, '/assessments');
      if (!present) await notify(ctx, r.personId, `You were marked absent for ${s.title}`, `/requests/${r.id}`);
    }
    // Waitlisted learners did not get a seat; close their requests.
    for (const w of await ctx.store.find('requests', { sessionId, statusCode: ['WAITLISTED', 'PENDING'] })) {
      await ctx.store.update('requests', { id: w.id }, { statusCode: 'WITHDRAWN', currentStepNo: null, updatedAt: at });
      await ctx.store.update('approvalSteps', { requestId: w.id, statusCode: ['WAITING', 'PENDING'] }, { statusCode: 'CANCELLED' });
      await notify(ctx, w.personId, `${s.title} took place without a seat for you — request closed`, `/requests/${w.id}`);
    }
    await ctx.store.update('sessions', { id: sessionId }, { attendanceLockedAt: at, attendanceLockedBy: ctx.actor, updatedAt: at });
    await audit(ctx, `Locked attendance (${attended}/${reqs.length} attended)`, 'SESSION', s.title);
  });
  return { attended, total: reqs.length };
}

/* ----------------------------- Exams ----------------------------- */

function toQuestion(q: R<'examQuestions'>, withAnswer: boolean): Question {
  return {
    id: q.id,
    text: q.questionText,
    choices: JSON.parse(q.choicesJson) as string[],
    ...(withAnswer && { correctIndex: q.correctIndex }),
    sortOrder: q.sortOrder,
  };
}

export async function getExam(ctx: Ctx, sessionId: number): Promise<Exam | null> {
  await trainerSession(ctx, sessionId);
  const e = await examOf(ctx, sessionId);
  if (!e) return null;
  const [qs, results] = await Promise.all([
    ctx.store.find('examQuestions', { examId: e.id }, { orderBy: ['sortOrder', 'id'] }),
    ctx.store.find('examResults', { examId: e.id }),
  ]);
  return {
    id: e.id,
    sessionId,
    status: e.statusCode as Exam['status'],
    passTheory: e.passTheory,
    passPractical: e.passPractical,
    hasPractical: e.practicalFlag,
    released: e.releasedFlag,
    questions: qs.map((q) => toQuestion(q, true)),
    submissions: results.filter((r) => r.submittedAt).length,
  };
}

export async function createExam(ctx: Ctx, sessionId: number) {
  const { s } = await trainerSession(ctx, sessionId);
  if (await examOf(ctx, sessionId)) throw invalid('This session already has an exam');
  const st = await settings(ctx);
  await ctx.store.tx(async () => {
    await ctx.store.insert('exams', {
      sessionId,
      statusCode: 'DRAFT',
      passTheory: settingInt(st, 'PASS_THEORY_DEFAULT'),
      passPractical: settingInt(st, 'PASS_PRACTICAL_DEFAULT'),
      practicalFlag: true,
      releasedFlag: false,
      createdBy: ctx.actor,
      createdAt: nowIso(ctx),
    });
    await audit(ctx, 'Created exam', 'SESSION', s.title);
  });
  return getExam(ctx, sessionId);
}

async function editableExam(ctx: Ctx, sessionId: number, allowPublished = false) {
  await trainerSession(ctx, sessionId);
  const e = await examOf(ctx, sessionId);
  if (!e) throw notFound('Exam');
  if (e.releasedFlag) throw invalid('Results are released — the exam can no longer change');
  if (!allowPublished && e.statusCode !== 'DRAFT') throw invalid('Unpublish the exam to change its questions');
  return e;
}

export async function updateExam(ctx: Ctx, sessionId: number, input: { passTheory: number; passPractical: number; hasPractical: boolean }) {
  const e = await editableExam(ctx, sessionId, true);
  const subs = await ctx.store.count('examResults', { examId: e.id });
  if (subs && e.statusCode === 'PUBLISHED' && input.hasPractical !== e.practicalFlag)
    throw invalid('Learners have started — the practical setting cannot change now');
  await ctx.store.update('exams', { id: e.id }, { passTheory: input.passTheory, passPractical: input.passPractical, practicalFlag: input.hasPractical });
  return getExam(ctx, sessionId);
}

export async function saveQuestion(ctx: Ctx, sessionId: number, input: { text: string; choices: string[]; correctIndex: number }, questionId?: number) {
  const e = await editableExam(ctx, sessionId);
  const row = { questionText: input.text, choicesJson: JSON.stringify(input.choices), correctIndex: input.correctIndex };
  if (questionId) {
    const n = await ctx.store.update('examQuestions', { id: questionId, examId: e.id }, row);
    if (!n) throw notFound('Question');
  } else {
    const count = await ctx.store.count('examQuestions', { examId: e.id });
    await ctx.store.insert('examQuestions', { ...row, examId: e.id, sortOrder: count + 1 });
  }
  return getExam(ctx, sessionId);
}

export async function deleteQuestion(ctx: Ctx, sessionId: number, questionId: number) {
  const e = await editableExam(ctx, sessionId);
  await ctx.store.remove('examQuestions', { id: questionId, examId: e.id });
  return getExam(ctx, sessionId);
}

export async function publishExam(ctx: Ctx, sessionId: number, publish: boolean) {
  const e = await editableExam(ctx, sessionId, true);
  const { s } = await trainerSession(ctx, sessionId);
  if (publish) {
    const min = settingInt(await settings(ctx), 'MIN_QUESTIONS');
    const n = await ctx.store.count('examQuestions', { examId: e.id });
    if (n < min) throw invalid(`At least ${min} questions are needed to publish (now ${n})`);
    await ctx.store.tx(async () => {
      await ctx.store.update('exams', { id: e.id }, { statusCode: 'PUBLISHED', publishedAt: nowIso(ctx) });
      await audit(ctx, 'Published exam', 'SESSION', s.title);
      for (const r of await ctx.store.find('requests', { sessionId, statusCode: 'ATTENDED' }))
        await notify(ctx, r.personId, `The ${s.title} test is open — take it in Assessments`, '/assessments');
    });
  } else {
    if (await ctx.store.count('examResults', { examId: e.id })) throw invalid('Learners have already submitted — it cannot be unpublished');
    await ctx.store.update('exams', { id: e.id }, { statusCode: 'DRAFT', publishedAt: null });
  }
  return getExam(ctx, sessionId);
}

export async function savePractical(ctx: Ctx, sessionId: number, marks: Record<string, number | null>) {
  const e = await editableExam(ctx, sessionId, true);
  const { s } = await trainerSession(ctx, sessionId);
  if (!s.attendanceLockedAt) throw invalid('Lock attendance first');
  if (!e.practicalFlag) throw invalid('This exam has no practical part');
  const attendees = new Set((await ctx.store.find('requests', { sessionId, statusCode: 'ATTENDED' })).map((r) => r.personId));
  await ctx.store.tx(async () => {
    for (const [k, v] of Object.entries(marks)) {
      const personId = Number(k);
      if (!attendees.has(personId)) throw validation(`#${personId} did not attend`);
      const cur = await ctx.store.one('examResults', { examId: e.id, personId });
      if (cur) await ctx.store.update('examResults', { id: cur.id }, { practicalScore: v });
      else await ctx.store.insert('examResults', { examId: e.id, personId, practicalScore: v, releasedFlag: false });
    }
  });
}

export async function releaseResults(ctx: Ctx, sessionId: number, force: boolean) {
  const { dir, s } = await trainerSession(ctx, sessionId);
  const e = await examOf(ctx, sessionId);
  if (!e) throw notFound('Exam');
  if (e.releasedFlag) throw invalid('Results are already released');
  if (e.statusCode !== 'PUBLISHED') throw invalid('Publish the exam before releasing results');
  if (!s.attendanceLockedAt) throw invalid('Lock attendance first');
  const attendees = await ctx.store.find('requests', { sessionId, statusCode: 'ATTENDED' });
  const results = new Map((await ctx.store.find('examResults', { examId: e.id })).map((r) => [r.personId, r]));
  if (e.practicalFlag) {
    const missing = attendees.filter((r) => results.get(r.personId)?.practicalScore == null);
    if (missing.length)
      throw validation(`Practical marks are required for every attendee (${missing.length} missing)`, {
        missing: missing.map((m) => m.personId).join(','),
      });
  }
  const notSubmitted = attendees.filter((r) => !results.get(r.personId)?.submittedAt);
  if (notSubmitted.length && !force)
    throw new AppError('INVALID_STATE', `${notSubmitted.length} learner(s) have not taken the theory test. Releasing now marks them Not passed.`, {
      confirm: true,
      notSubmitted: notSubmitted.length,
    });
  let passed = 0;
  await ctx.store.tx(async () => {
    const at = nowIso(ctx);
    for (const r of attendees) {
      const x = results.get(r.personId);
      const pass =
        !!x?.submittedAt &&
        (x.theoryScore ?? 0) >= e.passTheory &&
        (!e.practicalFlag || (x.practicalScore ?? 0) >= e.passPractical);
      if (x) await ctx.store.update('examResults', { id: x.id }, { passedFlag: pass, releasedFlag: true });
      else await ctx.store.insert('examResults', { examId: e.id, personId: r.personId, passedFlag: false, releasedFlag: true });
      await ctx.store.update('requests', { id: r.id }, { statusCode: pass ? 'COMPLETED' : 'NOT_PASSED', updatedAt: at });
      if (pass) {
        passed++;
        const lvl = await raiseLevel(ctx, dir, r.personId, s, r.id);
        await notify(ctx, r.personId, `Passed ${s.title} — your skill is now L${lvl}`, '/skills');
      } else await notify(ctx, r.personId, `Result released for ${s.title}: not passed`, '/assessments');
    }
    await ctx.store.update('exams', { id: e.id }, { releasedFlag: true, releasedAt: at, releasedBy: ctx.actor });
    await audit(ctx, `Released results (${passed}/${attendees.length} passed)`, 'SESSION', s.title);
  });
  return { passed, total: attendees.length };
}

/* ----------------------------- Learner side ----------------------------- */

export async function myAssessments(ctx: Ctx): Promise<MyAssessment[]> {
  const reqs = await ctx.store.find('requests', { personId: ctx.actor!, statusCode: ['ATTENDED', 'COMPLETED', 'NOT_PASSED'] });
  if (!reqs.length) return [];
  const exams = await ctx.store.find('exams', { sessionId: reqs.map((r) => r.sessionId) });
  const sessions = await ctx.store.find('sessions', { id: reqs.map((r) => r.sessionId) });
  const L = await sessionLookups(ctx, reqs.map((r) => r.sessionId));
  const out: MyAssessment[] = [];
  for (const r of reqs) {
    const e = exams.find((x) => x.sessionId === r.sessionId);
    if (!e) continue;
    const res = await ctx.store.one('examResults', { examId: e.id, personId: ctx.actor! });
    const state: MyAssessment['state'] = e.releasedFlag
      ? 'released'
      : res?.submittedAt
        ? 'marking'
        : e.statusCode === 'PUBLISHED' && r.statusCode === 'ATTENDED'
          ? 'open'
          : 'notready';
    const qs = state === 'open' ? await ctx.store.find('examQuestions', { examId: e.id }, { orderBy: ['sortOrder', 'id'] }) : [];
    out.push({
      requestId: r.id,
      session: toSession(sessions.find((s) => s.id === r.sessionId)!, L),
      state,
      questions: qs.map((q) => toQuestion(q, false)),
      theory: res?.submittedAt ? res.theoryScore : null,
      practical: e.releasedFlag ? (res?.practicalScore ?? null) : null,
      passed: e.releasedFlag ? (res?.passedFlag ?? false) : null,
      passTheory: e.passTheory,
      passPractical: e.passPractical,
    });
  }
  return out;
}

export async function submitExam(ctx: Ctx, sessionId: number, answers: number[]) {
  const r = await ctx.store.one('requests', { personId: ctx.actor!, sessionId, statusCode: 'ATTENDED' });
  if (!r) throw forbidden('Only learners who attended can take this test');
  const e = await examOf(ctx, sessionId);
  if (!e || e.statusCode !== 'PUBLISHED' || e.releasedFlag) throw invalid('This test is not open');
  const qs = await ctx.store.find('examQuestions', { examId: e.id }, { orderBy: ['sortOrder', 'id'] });
  if (answers.length !== qs.length) throw validation('Answer every question first');
  const cur = await ctx.store.one('examResults', { examId: e.id, personId: ctx.actor! });
  if (cur?.submittedAt) throw invalid('You have already submitted this test');
  const right = qs.filter((q, i) => answers[i] === q.correctIndex).length;
  const theory = Math.round((right / qs.length) * 100);
  const s = (await ctx.store.one('sessions', { id: sessionId }))!;
  const dir = await directory(ctx);
  await ctx.store.tx(async () => {
    const row = { answersJson: JSON.stringify(answers), theoryScore: theory, submittedAt: nowIso(ctx) };
    if (cur) await ctx.store.update('examResults', { id: cur.id }, row);
    else await ctx.store.insert('examResults', { ...row, examId: e.id, personId: ctx.actor!, releasedFlag: false });
    await audit(ctx, 'Submitted assessment', 'SESSION', s.title);
    await notify(ctx, s.trainerPersonId, `${nameOf(dir, ctx.actor)} submitted the ${s.title} test (${theory}%)`, '/attendance');
  });
  return { theory };
}
