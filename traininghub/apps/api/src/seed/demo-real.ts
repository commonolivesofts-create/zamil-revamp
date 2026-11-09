// Dummy training data on top of the REAL employee list (test environments only).
// Everything it creates is tagged so `removeDemoData` can take it out again:
//   sessions → description starts with [DEMO] (requests, steps, attendance, exams hang off them)
//   skill levels / history → sourceCode DEMO · position overrides → updatedBy 0
//   roles → grantedBy 0 · delegations → reason starts with [DEMO]
import type { Store } from '../db/store';
import type { R } from '../db/tables';
import { addDays } from '../lib/dates';
import { POSITIONS } from './masterdata';

const TAG = '[DEMO]';
const SYS = 0;

interface Person {
  personId: number;
  name: string;
  managerId: number | null;
  positionId: number | null;
}

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export async function hasDemoData(store: Store) {
  return (await store.find('sessions')).some((s) => (s.description ?? '').startsWith(TAG));
}

export async function addDemoData(store: Store, opts: { now?: Date; bootstrap?: string[] } = {}) {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);
  const ts = (n: number, hh = '09:00') => `${d(n)}T${hh}:00.000Z`;
  const rnd = rng(11);
  const log: string[] = [];

  const [emps, ext, jobs, positions, skills] = await Promise.all([
    store.find('employees', { activeFlag: true }),
    store.find('employeeExt'),
    store.find('positionJobs'),
    store.find('positions'),
    store.find('skills'),
  ]);
  if (!emps.length) throw new Error('No active employees — run the employee sync first.');
  if (!positions.length) throw new Error('No positions — run npm run db:seed first.');
  const active = new Set(emps.map((e) => e.personId));
  const extMap = new Map(ext.map((e) => [e.personId, e.positionId]));
  const jobMap = new Map(jobs.map((j) => [j.jobName.toLowerCase(), j.positionId]));
  const people = new Map<number, Person>(
    emps.map((e) => [
      e.personId,
      {
        personId: e.personId,
        name: e.fullName,
        managerId: e.supervisorPersonId && active.has(e.supervisorPersonId) ? e.supervisorPersonId : null,
        positionId:
          extMap.get(e.personId) ?? (e.jobName ? jobMap.get(e.jobName.toLowerCase()) : undefined) ?? null,
      },
    ]),
  );
  const reports = new Map<number, number[]>();
  for (const p of people.values())
    if (p.managerId) reports.set(p.managerId, [...(reports.get(p.managerId) ?? []), p.personId]);
  const byName = new Map(positions.map((p) => [p.name, p]));
  const pos = (id: string) => byName.get(POSITIONS.find((x) => x.id === id)?.name ?? '')!;

  await store.tx(async () => {
    /* 1. Make sure every profile with skills has an approved version (eligibility needs one). */
    for (const p of positions) {
      if (p.versionNo > 0) continue;
      const draft = await store.find('positionSkills', { positionId: p.id });
      if (!draft.length) continue;
      for (const s of draft)
        await store.insert('positionSkillsApproved', {
          positionId: p.id,
          versionNo: 1,
          skillId: s.skillId,
          requirementCode: s.requirementCode,
          targetLevel: s.targetLevel,
          criticalFlag: s.criticalFlag,
        });
      await store.update(
        'positions',
        { id: p.id },
        { statusCode: 'APPROVED', versionNo: 1, approvedAt: now.toISOString(), updatedAt: now.toISOString() },
      );
      p.versionNo = 1;
      log.push(`approved ${p.name} v1`);
    }

    /* 2. Put a few real teams into IT positions (manager → supervisor, reports → specialist roles). */
    const mappedCount = [...people.values()].filter((p) => p.positionId).length;
    if (mappedCount < 15) {
      const boot = (opts.bootstrap ?? [])
        .map((n) => emps.find((e) => e.personNumber === n)?.personId)
        .filter((x): x is number => !!x);
      const managers = [...reports.entries()]
        .filter(([m, r]) => r.length >= 2 && !people.get(m)?.positionId)
        .sort(
          (a, b) => Number(boot.includes(b[0])) - Number(boot.includes(a[0])) || b[1].length - a[1].length,
        )
        .slice(0, 5)
        .map(([m]) => m);
      const specialist = ['ora', 'fun', 'dba', 'sys', 'net', 'dev', 'da', 'hel'].map(pos).filter(Boolean);
      let k = 0;
      let n = 0;
      for (const m of managers) {
        const mp = people.get(m)!;
        mp.positionId = (n === 0 ? pos('sup') : pos(n % 2 ? 'sup' : 'mgr'))?.id ?? specialist[0]!.id;
        await store.upsert('employeeExt', ['personId'], {
          personId: m,
          positionId: mp.positionId,
          updatedBy: SYS,
          updatedAt: now.toISOString(),
        });
        n++;
        for (const r of (reports.get(m) ?? []).slice(0, 6)) {
          const rp = people.get(r)!;
          if (rp.positionId) continue;
          rp.positionId = specialist[k++ % specialist.length]!.id;
          await store.upsert('employeeExt', ['personId'], {
            personId: r,
            positionId: rp.positionId,
            updatedBy: SYS,
            updatedAt: now.toISOString(),
          });
          n++;
        }
      }
      log.push(`mapped ${n} employees (${managers.length} teams) to IT positions`);
    }
    const mapped = [...people.values()].filter((p) => p.positionId);

    /* 3. Current skill levels for mapped people that have none. */
    const profiles = new Map<number, R<'positionSkillsApproved'>[]>();
    for (const p of positions) {
      const fresh = await store.one('positions', { id: p.id });
      profiles.set(
        p.id,
        fresh && fresh.versionNo
          ? await store.find('positionSkillsApproved', { positionId: p.id, versionNo: fresh.versionNo })
          : [],
      );
    }
    const have = new Set(
      (await store.find('employeeSkills', { personId: mapped.map((m) => m.personId) })).map(
        (s) => s.personId,
      ),
    );
    let rated = 0;
    for (const m of mapped) {
      if (have.has(m.personId)) continue;
      for (const s of profiles.get(m.positionId!) ?? []) {
        const x = rnd();
        const base = s.requirementCode === 'U' ? 1 : s.targetLevel;
        const lvl = Math.max(0, Math.min(4, base + (x < 0.15 ? -2 : x < 0.45 ? -1 : x < 0.88 ? 0 : 1)));
        await store.insert('employeeSkills', {
          personId: m.personId,
          skillId: s.skillId,
          skillLevel: lvl,
          assessedAt: ts(-20),
          assessedBy: m.managerId,
          sourceCode: 'DEMO',
        });
      }
      rated++;
    }
    log.push(`rated skills for ${rated} employees`);

    /* 4. HR Lead role, so the second approval step has someone to go to. */
    if (!(await store.count('userRoles', { roleCode: 'HR_LEAD' }))) {
      for (const num of opts.bootstrap ?? []) {
        const e = emps.find((x) => x.personNumber === num);
        if (e)
          await store.upsert('userRoles', ['personId', 'roleCode'], {
            personId: e.personId,
            roleCode: 'HR_LEAD',
            grantedBy: SYS,
            grantedAt: now.toISOString(),
          });
      }
      log.push(`granted HR Lead to ${(opts.bootstrap ?? []).join(', ')} (demo)`);
    }

    /* 5. Sessions. */
    const skillId = (name: string) => skills.find((s) => s.name === name)?.id ?? skills[0]!.id;
    const trainerFor = (sk: number) => {
      const strong = mapped.find((m) =>
        (profiles.get(m.positionId!) ?? []).some((s) => s.skillId === sk && s.targetLevel >= 3),
      );
      return (strong ?? mapped[0] ?? [...people.values()][0]!).personId;
    };
    type T = [
      title: string,
      skill: string,
      ext: string | null,
      from: number,
      to: number,
      start: string,
      end: string,
      cap: number,
      band: [number, number],
      cost: number,
      room: string,
      online?: boolean,
    ];
    const T: T[] = [
      [
        'Project Management Essentials',
        'Project Planning and Management',
        null,
        -22,
        -22,
        '09:00',
        '13:00',
        12,
        [1, 3],
        0,
        'Training Room A · Dammam HQ',
      ],
      [
        'Fusion BIP & OTBI Reporting',
        'Cloud Fusion SaaS',
        null,
        -1,
        -1,
        '09:00',
        '13:00',
        12,
        [0, 3],
        0,
        'Training Room A · Dammam HQ',
      ],
      [
        'Oracle SQL Performance Tuning',
        'Database Administration',
        null,
        5,
        6,
        '09:00',
        '12:00',
        10,
        [1, 3],
        0,
        'Training Room B · Dammam HQ',
      ],
      [
        'ISO 27001 Information Security Awareness',
        'ISO 9001 / 27001 awareness',
        'Bureau Veritas',
        10,
        12,
        '08:30',
        '16:30',
        6,
        [0, 2],
        4800,
        'Bureau Veritas · Al Khobar',
      ],
      [
        'Power BI for Finance & IT',
        'Power BI / reporting',
        null,
        3,
        3,
        '10:00',
        '12:30',
        20,
        [0, 2],
        0,
        'Microsoft Teams',
        true,
      ],
      [
        'Oracle Integration Cloud Essentials',
        'Integration',
        'Oracle University',
        16,
        18,
        '09:00',
        '16:00',
        5,
        [0, 3],
        6500,
        'Oracle University · Online live',
        true,
      ],
      [
        'ITIL 4 Foundation',
        'IT service management',
        'PeopleCert ATO',
        23,
        25,
        '08:30',
        '15:30',
        8,
        [0, 3],
        3200,
        'Riyadh · Hilton',
      ],
      [
        'Basic First Aid Refresher',
        'Basic of First Aid',
        null,
        7,
        7,
        '07:30',
        '09:30',
        20,
        [0, 4],
        0,
        'Plant 1 · Meeting Hall',
      ],
      [
        'Cybersecurity Essentials for IT',
        'Cybersecurity',
        null,
        11,
        11,
        '09:00',
        '12:00',
        15,
        [0, 3],
        0,
        'Training Room B · Dammam HQ',
      ],
      [
        'Agile & Scrum in Practice',
        'Agile / Scrum',
        null,
        19,
        19,
        '09:00',
        '13:00',
        14,
        [0, 3],
        0,
        'Training Room A · Dammam HQ',
      ],
      [
        'Leading High-Performing Teams',
        'Motivating others',
        'Dale Carnegie KSA',
        26,
        27,
        '08:30',
        '16:30',
        6,
        [0, 3],
        5800,
        'Dale Carnegie · Al Khobar',
      ],
      [
        'Effective Communication at Work',
        'Communication skills',
        null,
        14,
        14,
        '09:00',
        '12:00',
        16,
        [0, 3],
        0,
        'Training Room A · Dammam HQ',
      ],
    ];
    const sessions: R<'sessions'>[] = [];
    for (const t of T) {
      const sk = skillId(t[1]);
      const internal = !t[2];
      const s = await store.insert('sessions', {
        title: t[0],
        skillId: sk,
        sessionType: internal ? 'INTERNAL' : 'EXTERNAL',
        trainerPersonId: internal ? trainerFor(sk) : null,
        provider: t[2],
        startDate: d(t[3]),
        endDate: d(t[4]),
        startTime: t[5],
        endTime: t[6],
        capacity: t[7],
        externalSeats: 0,
        bandFrom: t[8][0],
        bandTo: t[8][1],
        costHalalas: t[9] * 100,
        location: t[10],
        deliveryMode: t[11] ? 'ONLINE' : 'IN_PERSON',
        description: `${TAG} Sample session for testing.`,
        statusCode: 'SCHEDULED',
        createdBy: SYS,
        createdAt: ts(-40),
        updatedAt: ts(-40),
        attendanceLockedAt: t[3] < -7 ? ts(t[3], '13:30') : null,
      });
      sessions.push(s);
    }
    log.push(`created ${sessions.length} sessions`);

    /* 6. Requests in every state, Direct manager → HR Lead. */
    const hrLeads = (await store.find('userRoles', { roleCode: 'HR_LEAD' })).map((r) => r.personId);
    const pool = mapped.filter((m) => m.managerId);
    const pick = (i: number) => pool[i % Math.max(1, pool.length)];
    let seq = 0;
    const request = async (
      who: Person,
      s: R<'sessions'>,
      status: string,
      at: 'mgr' | 'hr' | null,
      created: number,
      reason: string,
      comment?: string,
    ) => {
      const createdAt = ts(created, '08:00');
      const done = !at;
      const r = await store.insert('requests', {
        personId: who.personId,
        sessionId: s.id,
        reason,
        statusCode: status,
        currentStepNo: at === 'mgr' ? 1 : at === 'hr' ? 2 : null,
        createdBy: who.personId,
        createdAt,
        updatedAt: createdAt,
        decidedAt: done ? ts(created + 1, '10:00') : null,
      });
      await store.update(
        'requests',
        { id: r.id },
        { requestNo: `TR-${createdAt.slice(0, 4)}-${String(r.id).padStart(5, '0')}` },
      );
      const mgrStatus = status === 'REJECTED' ? 'REJECTED' : at === 'mgr' ? 'PENDING' : 'APPROVED';
      const hrStatus =
        status === 'REJECTED' ? 'CANCELLED' : at === 'mgr' ? 'WAITING' : at === 'hr' ? 'PENDING' : 'APPROVED';
      await store.insert('approvalSteps', {
        requestId: r.id,
        stepNo: 1,
        label: 'Direct manager',
        approverType: 'DIRECT_MANAGER',
        approverPersonId: who.managerId,
        originalPersonId: who.managerId,
        statusCode: mgrStatus,
        sinceAt: createdAt,
        actedAt: mgrStatus === 'PENDING' ? null : ts(created, '11:00'),
        actedBy: mgrStatus === 'PENDING' ? null : who.managerId,
        comments: comment ?? null,
      });
      const hrBy = hrLeads.find((h) => h !== who.personId) ?? null;
      await store.insert('approvalSteps', {
        requestId: r.id,
        stepNo: 2,
        label: 'HR Lead',
        approverType: 'ROLE',
        roleCode: 'HR_LEAD',
        statusCode: hrStatus,
        sinceAt: hrStatus === 'WAITING' || hrStatus === 'CANCELLED' ? null : ts(created, '11:00'),
        actedAt: hrStatus === 'APPROVED' ? ts(created + 1, '10:00') : null,
        actedBy: hrStatus === 'APPROVED' ? hrBy : null,
      });
      seq++;
      return r;
    };
    const reasons = [
      'Close the gap identified in my last skills assessment.',
      'Needed for the Fusion SCM rollout tasks assigned to me this quarter.',
      'My manager asked me to take ownership of this area.',
      'Required for the new service desk process.',
      'To support the team on upcoming integration work.',
    ];
    // Past session: completed with released results.
    const exam0 = await store.insert('exams', {
      sessionId: sessions[0]!.id,
      statusCode: 'PUBLISHED',
      passTheory: 70,
      passPractical: 6,
      practicalFlag: true,
      releasedFlag: true,
      releasedAt: ts(-21),
      publishedAt: ts(-25),
      createdAt: ts(-30),
    });
    for (let i = 0; i < 3 && pool.length; i++) {
      const who = pick(i)!;
      const r = await request(
        who,
        sessions[0]!,
        i === 2 ? 'NOT_PASSED' : 'COMPLETED',
        null,
        -36,
        reasons[i % 5]!,
      );
      await store.upsert('attendance', ['sessionId', 'personId'], {
        sessionId: sessions[0]!.id,
        personId: who.personId,
        markCode: 'PRESENT',
        markedAt: ts(-22, '13:00'),
      });
      await store.upsert('examResults', ['examId', 'personId'], {
        examId: exam0.id,
        personId: who.personId,
        answersJson: '[0,0,0]',
        theoryScore: i === 2 ? 33 : 100,
        submittedAt: ts(-22, '14:00'),
        practicalScore: i === 2 ? 4 : 8,
        passedFlag: i !== 2,
        releasedFlag: true,
      });
      if (i !== 2)
        await store.insert('skillHistory', {
          personId: who.personId,
          skillId: sessions[0]!.skillId,
          fromLevel: 1,
          toLevel: 2,
          sourceCode: 'DEMO',
          refId: r.id,
          changedAt: ts(-21),
          note: sessions[0]!.title,
        });
    }
    // Yesterday: approved, attendance waiting for the trainer; exam published.
    const exam1 = await store.insert('exams', {
      sessionId: sessions[1]!.id,
      statusCode: 'PUBLISHED',
      passTheory: 70,
      passPractical: 6,
      practicalFlag: true,
      releasedFlag: false,
      publishedAt: ts(-3),
      createdAt: ts(-10),
    });
    for (let i = 3; i < 7 && pool.length; i++)
      await request(pick(i)!, sessions[1]!, 'APPROVED', null, -14, reasons[i % 5]!);
    // Upcoming: in approval, approved, rejected.
    const plan: [number, string, 'mgr' | 'hr' | null, number][] = [
      [2, 'PENDING', 'mgr', -3],
      [4, 'PENDING', 'mgr', 0],
      [9, 'PENDING', 'mgr', -1],
      [5, 'PENDING', 'hr', -6],
      [3, 'PENDING', 'hr', -8],
      [6, 'PENDING', 'hr', -4],
      [7, 'APPROVED', null, -10],
      [8, 'APPROVED', null, -9],
      [11, 'APPROVED', null, -5],
      [10, 'PENDING', 'mgr', -2],
      [2, 'REJECTED', null, -12],
    ];
    for (const [idx, [si, st, at, day]] of plan.entries()) {
      const who = pick(7 + idx);
      if (!who) break;
      await request(
        who,
        sessions[si]!,
        st,
        at,
        day,
        reasons[idx % 5]!,
        st === 'REJECTED' ? 'Not a priority this quarter — let us revisit in Q1.' : undefined,
      );
    }
    log.push(`created ${seq} requests`);
    const QS: [string, string[], number][] = [
      [
        'Which tool is best for ad-hoc analysis on real-time Fusion data?',
        ['BI Publisher', 'OTBI', 'FBDI', 'HDL'],
        1,
      ],
      [
        'A pixel-perfect statement emailed in bulk is built in…',
        ['OTBI analysis', 'BI Publisher report', 'Smart View', 'Infolets'],
        1,
      ],
      [
        'OTBI subject areas are secured by…',
        ['Database grants', 'Fusion data and duty roles', 'BIP data models', 'Report folders'],
        1,
      ],
    ];
    for (const e of [exam0, exam1])
      for (const [j, [text, choices, correct]] of QS.entries())
        await store.insert('examQuestions', {
          examId: e.id,
          questionText: text,
          choicesJson: JSON.stringify(choices),
          correctIndex: correct,
          sortOrder: j + 1,
        });

    /* 7. A delegation between two managers. */
    const mgrs = [...new Set(pool.map((p) => p.managerId!))];
    if (mgrs.length >= 2)
      await store.insert('delegations', {
        fromPersonId: mgrs[1]!,
        toPersonId: mgrs[0]!,
        startDate: d(14),
        endDate: d(18),
        reason: `${TAG} Business trip`,
        cancelledFlag: false,
        createdBy: SYS,
        createdAt: now.toISOString(),
      });
  });
  return log;
}

export async function removeDemoData(store: Store) {
  const out: string[] = [];
  await store.tx(async () => {
    const ses = (await store.find('sessions'))
      .filter((s) => (s.description ?? '').startsWith(TAG))
      .map((s) => s.id);
    if (ses.length) {
      const reqs = (await store.find('requests', { sessionId: ses })).map((r) => r.id);
      if (reqs.length) {
        await store.remove('approvalSteps', { requestId: reqs });
        await store.remove('skillHistory', { refId: reqs, sourceCode: 'DEMO' });
        await store.remove('requests', { id: reqs });
      }
      const exams = (await store.find('exams', { sessionId: ses })).map((e) => e.id);
      if (exams.length) {
        await store.remove('examQuestions', { examId: exams });
        await store.remove('examResults', { examId: exams });
        await store.remove('exams', { id: exams });
      }
      await store.remove('attendance', { sessionId: ses });
      await store.remove('sessions', { id: ses });
      out.push(`${ses.length} sessions, ${reqs.length} requests`);
    }
    out.push(`${await store.remove('employeeSkills', { sourceCode: 'DEMO' })} skill levels`);
    await store.remove('skillHistory', { sourceCode: 'DEMO' });
    out.push(`${await store.remove('employeeExt', { updatedBy: SYS })} position overrides`);
    out.push(`${await store.remove('userRoles', { grantedBy: SYS })} roles`);
    for (const dl of (await store.find('delegations')).filter((x) => (x.reason ?? '').startsWith(TAG)))
      await store.remove('delegations', { id: dl.id });
  });
  return out;
}
