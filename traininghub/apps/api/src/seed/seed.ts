// Seeds an empty schema. Master data (skills library, IT positions + profiles, rules, settings,
// workflow) is safe for the real ADW schema; demo data (people, sessions, requests) is only for
// memory mode / mock Fusion, or on explicit request.
import { SETTINGS, type SettingKey } from '@traininghub/shared';
import type { Store } from '../db/store';
import { addDays } from '../lib/dates';
import { RULE_DEFAULTS, RULE_ORDER } from '../domain/eligibility';
import { DEFAULT_WORKFLOW } from '../domain/workflow';
import type { FusionEmployee } from '../integrations/fusion/employees';
import { CATEGORIES, POSITIONS, SKILLS, type SeedPosition } from './masterdata';

type Prof = Record<number, { r: 'R' | 'O' | 'U' | 'N'; l: number; c: boolean }>;

/** Deterministic profile builder (same rules as the JSM workbook samples). */
function buildProfiles() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Record<string, Prof> = {};
  for (const p of POSITIONS) {
    const prof: Prof = {};
    for (const s of SKILLS) {
      let r: Prof[number]['r'] = 'N';
      let l = 0;
      if (s.cat === 'beh') {
        r = 'R';
        l = p.mgmt === 'R' ? 3 : 2;
        if ([1, 6].includes(s.n) && p.mgmt !== 'R') {
          r = p.mgmt === 'O' ? 'O' : 'U';
          l = r === 'O' ? 2 : 1;
        }
      } else if (s.cat === 'bas') {
        r = 'R';
        l = p.id === 'hel' ? 2 : 3;
      } else if ([20, 21, 22].includes(s.n)) {
        r = 'R';
        l = s.n === 20 ? 2 : 1;
      } else if (s.cat === 'man') {
        r = p.mgmt as Prof[number]['r'];
        l = r === 'R' ? 3 : r === 'O' ? 2 : r === 'U' ? 1 : 0;
      } else if (p.core.includes(s.n)) {
        r = 'R';
        l = p.grade >= 'G9' || p.grade === 'G11' ? 4 : 3;
      } else if (p.sec.includes(s.n)) {
        r = 'O';
        l = 2;
      } else if (p.aw.includes(s.n)) {
        r = 'U';
        l = 1;
      }
      if (p.status === 'no') {
        r = 'N';
        l = 0;
      }
      prof[s.n] = { r, l, c: r === 'R' && p.core.includes(s.n) && rnd() > 0.45 };
    }
    out[p.id] = prof;
  }
  return { profiles: out, rnd };
}

export interface SeedOptions {
  /** Approve every non-empty position profile (version 1) so requests work at once. */
  approveProfiles?: boolean;
  ownerPersonId?: number | null;
  now?: Date;
}

export async function isEmpty(store: Store) {
  return (await store.count('skills')) === 0 && (await store.count('positions')) === 0;
}

export async function seedMaster(store: Store, opts: SeedOptions = {}) {
  const at = (opts.now ?? new Date()).toISOString();
  const { profiles } = buildProfiles();
  const catIds: Record<string, number> = {};
  const skillIds: Record<number, number> = {};
  const posIds: Record<string, number> = {};
  await store.tx(async () => {
    for (const c of CATEGORIES)
      catIds[c.key] = (
        await store.insert('categories', {
          code: c.code,
          name: c.name,
          colorIndex: c.colorIndex,
          sortOrder: c.sortOrder,
        })
      ).id;
    for (const s of SKILLS)
      skillIds[s.n] = (
        await store.insert('skills', {
          code: s.code,
          name: s.name,
          categoryId: catIds[s.cat]!,
          description: s.desc,
          level1: 'Basic — needs guidance, knows the concepts',
          level2: 'Intermediate — works independently on routine tasks',
          level3: 'Advanced — handles complex cases, guides others',
          level4: 'Expert — sets standards, recognised authority',
          activeFlag: true,
          createdAt: at,
        })
      ).id;
    for (const p of POSITIONS) {
      const approve = opts.approveProfiles && p.status !== 'no';
      const row = await store.insert('positions', {
        name: p.name,
        grade: p.grade,
        departmentName: 'IT Department',
        ownerPersonId: opts.ownerPersonId ?? null,
        statusCode: approve ? 'APPROVED' : 'DRAFT',
        versionNo: approve ? 1 : 0,
        approvedAt: approve ? at : null,
        requestLimit: p.id === 'hel' ? 6 : null,
        createdAt: at,
        updatedAt: at,
      });
      posIds[p.id] = row.id;
      await store.insert('positionJobs', { positionId: row.id, jobName: p.name });
      for (const [n, m] of Object.entries(profiles[p.id]!)) {
        if (m.r === 'N') continue;
        const skill = {
          positionId: row.id,
          skillId: skillIds[Number(n)]!,
          requirementCode: m.r,
          targetLevel: m.l,
          criticalFlag: m.c,
        };
        await store.insert('positionSkills', skill);
        if (approve) await store.insert('positionSkillsApproved', { ...skill, versionNo: 1 });
      }
    }
    for (const [i, code] of RULE_ORDER.entries()) {
      const d = RULE_DEFAULTS[code];
      await store.insert('rules', {
        ruleCode: code,
        enabledFlag: d.enabled,
        severity: d.severity,
        paramValue: d.param,
        sortOrder: i,
        updatedAt: at,
      });
    }
    const mandatory = [20, 21, 22].map((n) => SKILLS[n - 1]!.code).join(',');
    for (const [k, v] of Object.entries(SETTINGS))
      await store.insert('settings', {
        settingKey: k,
        settingValue: k === ('JSM_MANDATORY_SKILLS' as SettingKey) ? mandatory : v.def,
        updatedAt: at,
      });
    for (const [i, s] of DEFAULT_WORKFLOW.entries())
      await store.insert('workflowSteps', {
        stepNo: i + 1,
        label: s.label,
        approverType: s.approverType,
        roleCode: s.roleCode,
        personId: s.personId,
        conditionType: s.conditionType,
        conditionValue: s.conditionValue,
        enabledFlag: s.enabled,
        updatedAt: at,
      });
  });
  return { catIds, skillIds, posIds, profiles };
}

/* ------------------------------------ Demo ------------------------------------ */

const P = (id: number, name: string, job: string, dept: string, mgr: number | null): FusionEmployee => ({
  personId: id,
  personNumber: String(id),
  fullName: name,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@zamilplastic.example`,
  mobile: null,
  assignmentId: id + 900000,
  buCode: 'IPP',
  jobName: job,
  departmentName: dept,
  positionName: job,
  gradeName: null,
  locationCode: 'Dammam HQ',
  supervisorPersonId: mgr,
  active: true,
});
const POS = Object.fromEntries(POSITIONS.map((p) => [p.id, p])) as Record<string, SeedPosition>;
const IT = 'IT Department';

/** The mock Fusion HCM directory used in development (FUSION_MODE=mock). */
export const DEMO_PEOPLE: FusionEmployee[] = [
  P(1311, 'Faisal Al-Zamil', 'Head of Operations', 'Operations', null),
  P(1804, 'Omar Al-Harbi', POS.mgr!.name, IT, 1311),
  P(2172, 'Zaid Sayyed', POS.sup!.name, IT, 1804),
  P(2201, 'Rashid Al-Dossary', POS.sup!.name, IT, 1804),
  P(2333, 'Ahmed Siddiqui', POS.ora!.name, IT, 2172),
  P(2340, 'Lina Kurdi', POS.ora!.name, IT, 2172),
  P(2410, 'Sara Haddad', POS.fun!.name, IT, 2172),
  P(2418, 'Priya Menon', POS.fun!.name, IT, 2172),
  P(2377, 'Imran Shaikh', POS.dba!.name, IT, 2172),
  P(2381, 'Karthik Iyer', POS.dba!.name, IT, 2172),
  P(2290, 'Omar Bakr', POS.sys!.name, IT, 2201),
  P(2295, 'Tariq Hussain', POS.sys!.name, IT, 2201),
  P(2302, 'Fahad Al-Mutairi', POS.net!.name, IT, 2201),
  P(2455, 'Waleed Ali', POS.hel!.name, IT, 2290),
  P(2461, 'Sameer Patel', POS.hel!.name, IT, 2290),
  P(2466, 'Rahul Nair', POS.hel!.name, IT, 2290),
  P(2501, 'Yusuf Khan', POS.dev!.name, IT, 2172),
  P(2507, 'Hana Saleh', POS.dev!.name, IT, 2172),
  P(2520, 'Ayesha Rahman', POS.da!.name, IT, 2172),
  P(1190, 'Noura Al-Qahtani', 'HR Manager', 'HR and Admin', 1311),
  P(2514, 'Reem Al-Otaibi', 'HR Supervisor', 'HR and Admin', 1190),
  P(1650, 'Majed Saad', 'Finance Controller', 'Finance', 1311),
];
export const DEMO_PERSONAS: [number, string][] = [
  [2333, 'Employee — raises requests, takes exams'],
  [2172, 'Manager — approves team, assesses skills, owns IT JSM'],
  [1804, 'Senior manager — delegate for the Head of Operations'],
  [2514, 'HR Lead — final approval'],
  [1190, 'HR admin — profiles, sessions, workflow, setup'],
  [2377, 'Trainer — attendance, marks, exams'],
];

export async function seedDemo(store: Store, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const d = (offset: number) => addDays(today, offset);
  const ts = (offset: number, hh = '09:00') => `${d(offset)}T${hh}:00.000Z`;
  const at = now.toISOString();
  // Fusion mirror (the sync would do this in live mode).
  await store.tx(async () => {
    for (const p of DEMO_PEOPLE)
      await store.insert('employees', {
        personId: p.personId,
        personNumber: p.personNumber,
        fullName: p.fullName,
        email: p.email,
        buCode: p.buCode,
        jobName: p.jobName,
        departmentName: p.departmentName,
        positionName: p.positionName,
        locationCode: p.locationCode,
        assignmentId: p.assignmentId,
        supervisorPersonId: p.supervisorPersonId,
        activeFlag: true,
        syncedAt: at,
      });
  });
  const { skillIds, posIds, profiles, rnd } = {
    ...(await seedMaster(store, { ownerPersonId: 2172, now })),
    rnd: buildProfiles().rnd,
  };
  const S = (n: number) => skillIds[n]!;
  await store.tx(async () => {
    // Profiles: approved / draft-with-changes / pending / never approved — as in the JSM samples.
    for (const p of POSITIONS) {
      const id = posIds[p.id]!;
      const prof = profiles[p.id]!;
      const ver = p.id === 'da' ? 0 : p.ver;
      const status = { ok: 'APPROVED', dr: 'DRAFT', pe: 'PENDING', no: 'DRAFT' }[p.status]!;
      for (let v = 1; v <= ver && p.status !== 'no'; v++)
        for (const [n, m] of Object.entries(prof))
          if (m.r !== 'N')
            await store.insert('positionSkillsApproved', {
              positionId: id,
              versionNo: v,
              skillId: S(Number(n)),
              requirementCode: m.r,
              targetLevel: m.l,
              criticalFlag: m.c,
            });
      await store.update(
        'positions',
        { id },
        {
          statusCode: status,
          versionNo: p.status === 'no' ? 0 : ver,
          approvedAt: ver ? ts(-300) : null,
          approvedBy: ver ? 1190 : null,
          submittedAt: status === 'PENDING' ? ts(-6) : null,
          submittedBy: status === 'PENDING' ? 2172 : null,
        },
      );
      if (p.status === 'dr') {
        // A pending change in the draft: raise the first optional skill to required L3.
        const firstO = Object.entries(prof).find(([, m]) => m.r === 'O');
        if (firstO)
          await store.update(
            'positionSkills',
            { positionId: id, skillId: S(Number(firstO[0])) },
            { requirementCode: 'R', targetLevel: 3 },
          );
      }
    }
    // Roles.
    for (const [personId, roleCode] of [
      [2172, 'SYS_ADMIN'],
      [1190, 'HR_ADMIN'],
      [1190, 'HR_LEAD'],
      [2514, 'HR_LEAD'],
      [1650, 'FINANCE'],
    ] as const)
      await store.insert('userRoles', { personId, roleCode, grantedAt: at });

    // Current skill levels (manager assessment).
    const byPos = Object.fromEntries(POSITIONS.map((p) => [p.name, p.id]));
    for (const person of DEMO_PEOPLE) {
      const pid = byPos[person.jobName ?? ''];
      if (!pid) continue;
      const prof = profiles[pid]!;
      for (const s of SKILLS) {
        const m = prof[s.n]!;
        if (m.r === 'N') continue;
        const x = rnd();
        const lvl = Math.max(
          0,
          Math.min(4, (m.r === 'U' ? 1 : m.l) + (x < 0.12 ? -2 : x < 0.38 ? -1 : x < 0.86 ? 0 : 1)),
        );
        await store.insert('employeeSkills', {
          personId: person.personId,
          skillId: S(s.n),
          skillLevel: lvl,
          assessedAt: ts(-20),
          assessedBy: person.supervisorPersonId,
          sourceCode: 'ASSESSMENT',
        });
      }
    }
    const setLvl = async (personId: number, levels: Record<number, number>) => {
      for (const [n, l] of Object.entries(levels))
        await store.upsert('employeeSkills', ['personId', 'skillId'], {
          personId,
          skillId: S(Number(n)),
          skillLevel: l,
          assessedAt: ts(-20),
          assessedBy: 2172,
          sourceCode: 'ASSESSMENT',
        });
    };
    await setLvl(2333, { 39: 1, 16: 2, 18: 2, 32: 3, 43: 0 });
    await setLvl(2340, { 39: 1, 18: 1 });
    await setLvl(2410, { 39: 1 });
    await setLvl(2418, { 39: 2 });
    await setLvl(2381, { 16: 2 });
    await setLvl(2507, { 43: 1 });
    await setLvl(2172, { 36: 2 });

    // Sessions (dates relative to today).
    type Ses = [
      title: string,
      skill: number,
      type: 'INTERNAL' | 'EXTERNAL',
      trainer: number | null,
      provider: string,
      from: number,
      to: number,
      start: string,
      end: string,
      cap: number,
      ext: number,
      band: [number, number],
      cost: number,
      room: string,
      mode: 'IN_PERSON' | 'ONLINE',
    ];
    const SES: Ses[] = [
      [
        'Project Management Essentials',
        32,
        'INTERNAL',
        1804,
        '',
        -22,
        -22,
        '09:00',
        '13:00',
        12,
        6,
        [1, 3],
        0,
        'Training Room A · Dammam HQ',
        'IN_PERSON',
      ],
      [
        'Fusion BIP & OTBI Reporting',
        39,
        'INTERNAL',
        2377,
        '',
        -1,
        -1,
        '09:00',
        '13:00',
        12,
        4,
        [1, 2],
        0,
        'Training Room A · Dammam HQ',
        'IN_PERSON',
      ],
      [
        'Oracle SQL Performance Tuning',
        16,
        'INTERNAL',
        2377,
        '',
        5,
        6,
        '09:00',
        '12:00',
        10,
        5,
        [2, 3],
        0,
        'Training Room B · Dammam HQ',
        'IN_PERSON',
      ],
      [
        'ISO 27001 Information Security Awareness',
        52,
        'EXTERNAL',
        null,
        'Bureau Veritas',
        10,
        12,
        '08:30',
        '16:30',
        6,
        3,
        [0, 2],
        4800,
        'Bureau Veritas · Al Khobar',
        'IN_PERSON',
      ],
      [
        'Power BI for Finance & IT',
        47,
        'INTERNAL',
        2520,
        '',
        3,
        3,
        '10:00',
        '12:30',
        20,
        9,
        [0, 2],
        0,
        'Microsoft Teams',
        'ONLINE',
      ],
      [
        'Oracle Integration Cloud Essentials',
        18,
        'EXTERNAL',
        null,
        'Oracle University',
        16,
        18,
        '09:00',
        '16:00',
        5,
        2,
        [1, 3],
        6500,
        'Oracle University · Online live',
        'ONLINE',
      ],
      [
        'ITIL 4 Foundation',
        44,
        'EXTERNAL',
        null,
        'PeopleCert ATO',
        23,
        25,
        '08:30',
        '15:30',
        8,
        3,
        [0, 2],
        3200,
        'Riyadh · Hilton',
        'IN_PERSON',
      ],
      [
        'Basic First Aid Refresher',
        22,
        'INTERNAL',
        1804,
        '',
        7,
        7,
        '07:30',
        '09:30',
        20,
        14,
        [0, 4],
        0,
        'Plant 1 · Meeting Hall',
        'IN_PERSON',
      ],
      [
        'Fusion HCM — Absence Setup',
        33,
        'INTERNAL',
        2172,
        '',
        12,
        12,
        '13:00',
        '16:00',
        12,
        5,
        [1, 2],
        0,
        'Training Room A · Dammam HQ',
        'IN_PERSON',
      ],
      [
        'Cybersecurity Essentials for IT',
        29,
        'INTERNAL',
        2302,
        '',
        11,
        11,
        '09:00',
        '12:00',
        15,
        6,
        [0, 2],
        0,
        'Training Room B · Dammam HQ',
        'IN_PERSON',
      ],
      [
        'Agile & Scrum in Practice',
        43,
        'INTERNAL',
        2172,
        '',
        19,
        19,
        '09:00',
        '13:00',
        14,
        4,
        [0, 2],
        0,
        'Training Room A · Dammam HQ',
        'IN_PERSON',
      ],
      [
        'Leading High-Performing Teams',
        36,
        'EXTERNAL',
        null,
        'Dale Carnegie KSA',
        26,
        27,
        '08:30',
        '16:30',
        6,
        2,
        [1, 3],
        5800,
        'Dale Carnegie · Al Khobar',
        'IN_PERSON',
      ],
    ];
    const sid: number[] = [];
    for (const s of SES) {
      const row = await store.insert('sessions', {
        title: s[0],
        skillId: S(s[1]),
        sessionType: s[2],
        trainerPersonId: s[3],
        provider: s[4] || null,
        startDate: d(s[5]),
        endDate: d(s[6]),
        startTime: s[7],
        endTime: s[8],
        capacity: s[9],
        externalSeats: s[10],
        bandFrom: s[11][0],
        bandTo: s[11][1],
        costHalalas: s[12] * 100,
        location: s[13],
        deliveryMode: s[14],
        statusCode: 'SCHEDULED',
        createdBy: 1190,
        createdAt: ts(-40),
        updatedAt: ts(-40),
        attendanceLockedAt: s[5] < -7 ? ts(s[5], '13:30') : null,
        attendanceLockedBy: s[5] < -7 ? s[3] : null,
      });
      sid.push(row.id);
    }

    // Requests with a Direct manager → HR Lead route.
    type St = [
      label: string,
      type: 'DIRECT_MANAGER' | 'ROLE',
      who: number | null,
      status: string,
      actedBy: number | null,
      day: number,
      comment?: string,
    ];
    const DM = (who: number, status: string, day: number, comment?: string): St => [
      'Direct manager',
      'DIRECT_MANAGER',
      who,
      status,
      status === 'APPROVED' || status === 'REJECTED' ? who : null,
      day,
      comment,
    ];
    const HR = (status: string, by: number | null, day: number): St => [
      'HR Lead',
      'ROLE',
      null,
      status,
      by,
      day,
    ];
    const reqs: [
      person: number,
      ses: number,
      reason: string,
      created: number,
      status: string,
      steps: St[],
    ][] = [
      [
        2333,
        0,
        'Lead the Fusion SCM cut-over plan for FPP.',
        -36,
        'COMPLETED',
        [DM(2172, 'APPROVED', -36), HR('APPROVED', 2514, -35)],
      ],
      [
        2333,
        6,
        'ITIL for the new service desk.',
        -16,
        'REJECTED',
        [
          DM(2172, 'REJECTED', -15, 'Not a priority for your role this year — revisit in Q1.'),
          HR('CANCELLED', null, -15),
        ],
      ],
      ...[2333, 2340, 2410, 2418].map((e): [number, number, string, number, string, St[]] => [
        e,
        1,
        'Build OTBI dashboards for the SCM rollout.',
        -14,
        'APPROVED',
        [DM(2172, 'APPROVED', -14), HR('APPROVED', 1190, -13)],
      ]),
      [
        2381,
        2,
        'Close the SQL tuning gap from the October assessment.',
        -3,
        'PENDING',
        [DM(2172, 'PENDING', -3), HR('WAITING', null, -3)],
      ],
      [
        2507,
        10,
        'Our team is moving to two-week sprints.',
        0,
        'PENDING',
        [DM(2172, 'PENDING', 0), HR('WAITING', null, 0)],
      ],
      [
        2340,
        5,
        'Needed to own the OIC interfaces with WMS Cloud after go-live.',
        -6,
        'PENDING',
        [DM(2172, 'APPROVED', -6, 'Agreed — critical for WMS integration.'), HR('PENDING', null, -6)],
      ],
      [
        2172,
        11,
        'Formal leadership training ahead of taking over the ERP support team.',
        -4,
        'PENDING',
        [DM(1804, 'PENDING', -4), HR('WAITING', null, -4)],
      ],
      [
        2295,
        9,
        'Hardening checklist for new servers.',
        -8,
        'PENDING',
        [DM(2201, 'APPROVED', -8), HR('PENDING', null, -7)],
      ],
    ];
    for (const [personId, s, reason, day, status, steps] of reqs) {
      const created = ts(day, '08:00');
      const cur = steps.find((x) => x[3] === 'PENDING');
      const done = ['COMPLETED', 'REJECTED', 'APPROVED'].includes(status);
      const r = await store.insert('requests', {
        personId,
        sessionId: sid[s]!,
        reason,
        statusCode: status,
        currentStepNo: cur ? steps.indexOf(cur) + 1 : null,
        createdBy: personId,
        createdAt: created,
        updatedAt: created,
        decidedAt: done ? ts(steps.at(-1)![5], '10:00') : null,
      });
      await store.update(
        'requests',
        { id: r.id },
        { requestNo: `TR-${created.slice(0, 4)}-${String(r.id).padStart(5, '0')}` },
      );
      for (const [i, [label, type, who, st, by, sday, comment]] of steps.entries())
        await store.insert('approvalSteps', {
          requestId: r.id,
          stepNo: i + 1,
          label,
          approverType: type,
          roleCode: type === 'ROLE' ? 'HR_LEAD' : null,
          approverPersonId: who,
          originalPersonId: who,
          statusCode: st,
          sinceAt: st === 'WAITING' || st === 'CANCELLED' ? null : ts(sday, '08:30'),
          actedAt: by ? ts(sday, '11:00') : null,
          actedBy: by,
          comments: comment ?? null,
        });
    }
    // Past session: attendance + released exam for Ahmed.
    await store.insert('attendance', {
      sessionId: sid[0]!,
      personId: 2333,
      markCode: 'PRESENT',
      markedBy: 1804,
      markedAt: ts(-22, '13:00'),
    });
    const QS: Record<number, [string, string[], number][]> = {
      0: [
        [
          'What is the first output of project initiation?',
          ['Project charter', 'Gantt chart', 'Risk log', 'Lessons learned'],
          0,
        ],
        [
          'Which document controls scope changes?',
          ['Change request log', 'Org chart', 'Invoice', 'Timesheet'],
          0,
        ],
        [
          'RAID stands for…',
          [
            'Risks, Assumptions, Issues, Dependencies',
            'Roles, Actions, Ideas, Decisions',
            'Reports, Audits, Inputs, Data',
            'None of these',
          ],
          0,
        ],
      ],
      1: [
        [
          'Which tool is best for ad-hoc analysis on real-time Fusion transactional data?',
          ['BI Publisher', 'OTBI', 'FBDI', 'HDL'],
          1,
        ],
        [
          'A pixel-perfect supplier statement that must be emailed in bulk should be built in…',
          ['OTBI analysis', 'BI Publisher report', 'Smart View', 'Infolets'],
          1,
        ],
        [
          'OTBI subject areas are secured by…',
          ['Database grants', 'Fusion data and duty roles', 'BIP data models', 'Report folders'],
          1,
        ],
        [
          'Where do you schedule a BIP report to deliver to SFTP?',
          [
            'Scheduled Processes / BIP scheduler',
            'Setup and Maintenance',
            'Manage Data Access',
            'Page Composer',
          ],
          0,
        ],
        [
          'The fastest way to give users a KPI tile on the Fusion home page is an…',
          ['Infolet', 'HDL file', 'ESS job', 'Lookup'],
          0,
        ],
      ],
      2: [
        [
          'Which view shows the execution plan of a cached cursor?',
          ['V$SQL_PLAN', 'DBA_TABLES', 'V$SESSION', 'DBA_SEGMENTS'],
          0,
        ],
        [
          'A full table scan on a 50M-row table filtered by a selective column usually needs…',
          ['A bitmap join', 'An index on the filter column', 'More SGA', 'Parallel DML'],
          1,
        ],
      ],
    };
    for (const [k, qs] of Object.entries(QS)) {
      const i = Number(k);
      const released = i === 0;
      const e = await store.insert('exams', {
        sessionId: sid[i]!,
        statusCode: i === 2 ? 'DRAFT' : 'PUBLISHED',
        passTheory: 70,
        passPractical: 6,
        practicalFlag: true,
        releasedFlag: released,
        releasedAt: released ? ts(-21) : null,
        releasedBy: released ? 1804 : null,
        publishedAt: i === 2 ? null : ts(-25),
        createdBy: 1190,
        createdAt: ts(-30),
      });
      for (const [j, [text, choices, correct]] of qs.entries())
        await store.insert('examQuestions', {
          examId: e.id,
          questionText: text,
          choicesJson: JSON.stringify(choices),
          correctIndex: correct,
          sortOrder: j + 1,
        });
      if (released)
        await store.insert('examResults', {
          examId: e.id,
          personId: 2333,
          answersJson: '[0,0,0]',
          theoryScore: 100,
          submittedAt: ts(-22, '14:00'),
          practicalScore: 8,
          passedFlag: true,
          releasedFlag: true,
        });
    }
    await store.insert('skillHistory', {
      personId: 2333,
      skillId: S(32),
      fromLevel: 2,
      toLevel: 3,
      sourceCode: 'TRAINING',
      changedBy: 1804,
      changedAt: ts(-21),
      note: 'Project Management Essentials',
    });
    // Delegations: Head of Ops on leave now; HR admin trip later.
    await store.insert('delegations', {
      fromPersonId: 1311,
      toPersonId: 1804,
      startDate: d(-5),
      endDate: d(9),
      reason: 'Annual leave',
      cancelledFlag: false,
      createdBy: 1311,
      createdAt: ts(-6),
    });
    await store.insert('delegations', {
      fromPersonId: 1190,
      toPersonId: 2514,
      startDate: d(14),
      endDate: d(18),
      reason: 'Business trip',
      cancelledFlag: false,
      createdBy: 1190,
      createdAt: ts(-2),
    });
    // A few notifications and audit lines so the bell and the log are not empty.
    const N = (personId: number, message: string, linkPath: string, day: number) =>
      store.insert('notifications', { personId, message, linkPath, createdAt: ts(day), readFlag: false });
    await N(2172, '2 requests are waiting for your approval', '/approvals', 0);
    await N(2377, 'Mark attendance for Fusion BIP & OTBI Reporting', '/attendance', -1);
    await N(1190, '2 job skill profiles are waiting for HR approval', '/jsm', -6);
    await N(2514, 'Lina Kurdi · Oracle Integration Cloud Essentials needs your decision', '/approvals', -6);
    for (const [personId, action, entityType, entityRef, day] of [
      [2172, 'Submitted profile for HR approval', 'POSITION', POS.net!.name, -6],
      [1804, 'Released results (1/1 passed)', 'SESSION', 'Project Management Essentials', -21],
      [1190, 'Published session', 'SESSION', 'Oracle Integration Cloud Essentials', -40],
    ] as const)
      await store.insert('audit', { loggedAt: ts(day), personId, action, entityType, entityRef });
    await store.insert('syncRuns', {
      kind: 'EMPLOYEES',
      statusCode: 'SUCCESS',
      startedAt: ts(0, '02:00'),
      finishedAt: ts(0, '02:01'),
      rowsRead: DEMO_PEOPLE.length,
      inserted: DEMO_PEOPLE.length,
      updated: 0,
      deactivated: 0,
      message: `${DEMO_PEOPLE.length} employees from mock Fusion.`,
    });
  });
}
