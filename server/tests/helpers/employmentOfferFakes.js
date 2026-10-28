/*
 * In-memory double of employmentOffer.repository.js over an auth store's `state` (so
 * transactions snapshot/rollback it too). It mirrors the SQL semantics the service relies on:
 * UUID-readback key generation whose inserts omit the PK columns, legacy 'DD-Mon-YYYY' date
 * storage with ISO 'YYYY-MM-DD' reads, the NVL defaults (applicant '-', reqNo 0, salary 0 and
 * the two hardcoded probationary-period texts), insert-only columns (STATUS, PROBATIONARY_PERIOD
 * and line ATTRIBUTE2 — skipped by the §5.2 MERGE's MATCHED branch), the delete order (line then
 * header), §7.1 filters/sort/pagination with the HEADER_ID tie-breaker, the §7.4 HR-membership
 * scope and the §8 lookups. It does NOT prove the SQL; it proves the wiring of routes,
 * controllers, service and the transaction boundaries.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Hardcoded README §1.2 defaults applied by the insert SQL's NVL.
export const PROBATION_PERIOD = '3 months with the possibility to be extend to 6 Months.';
export const PROBATION_PERIOD_AR = 'ثلاثة أشهر مع قابلية تمديدها إلى ستة أشهر.';

/** Parses the stored 'DD-Mon-YYYY' date; mirrors TO_DATE semantics (no timezone involved). */
const legacyToTime = (value) => {
  if (!value) return null;
  const [, day, month, year] = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  return Date.UTC(Number(year), MONTHS.indexOf(month), Number(day));
};
const isoToTime = (value) => (value ? Date.parse(`${value}T00:00:00Z`) : null);
const day = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(date);
/** 'DD-Mon-YYYY' → 'YYYY-MM-DD' — what the read SQL's TO_CHAR produces. */
const legacyToIso = (value) =>
  value === null || value === undefined ? null : day(legacyToTime(value));

export function installEmploymentOffers(
  store,
  {
    hrUserIds = [],
    candidates = [],
    titles = [],
    allowances = {},
    arabicNumbers = {},
    hijriDates = {},
  } = {},
) {
  store.state.employmentOffers = {
    nextHeaderId: 1, // stands in for the DB trigger/identity
    nextLineId: 1,
    headers: [],
    lines: [],
  };
  store.state.offerHrUserIds = [...hrUserIds];
  // Only Approved + Passed interview rows feed the candidates datalist (README §8.1).
  store.state.offerCandidates = candidates.map((c) => ({
    status: 'Approved',
    evalStatus: 'Passed',
    requisitionNo: null,
    ...c,
  }));
  store.state.offerTitles = titles;
  store.state.offerAllowances = allowances;
  store.state.offerArabicNumbers = arabicNumbers;
  store.state.offerHijriDates = hijriDates;

  const table = () => store.state.employmentOffers; // re-read: a rollback replaces the object
  const headerOf = (headerId) => table().headers.find((h) => h.headerId === headerId);
  const lineOf = (headerId) => table().lines.find((l) => l.headerId === headerId);

  const toReadHeader = (h) => ({
    headerId: h.headerId,
    uuid: h.uuid,
    offerDate: legacyToIso(h.offerDate),
    employeeName: h.employeeName,
    employeeNameAr: h.employeeNameAr,
    position: h.position,
    status: h.status,
    division: h.division,
    applicant: h.applicant,
    to: h.to,
    toArabic: h.toArabic,
    intNo: h.intNo,
    reqNo: h.reqNo,
    createdBy: h.createdBy,
    createdAt: h.createdAt,
    updatedBy: h.updatedBy,
    updatedAt: h.updatedAt,
  });

  // The read projection of README §4.2: no line ATTRIBUTE2, ISO date, comment under its payload
  // name (legacy spellings are internal).
  const toReadLine = (l) => ({
    offerLineId: l.offerLineId,
    headerId: l.headerId,
    basicSalary: l.basicSalary,
    basicSalaryAr: l.basicSalaryAr,
    housingAllowance: l.housingAllowance,
    housingAllowanceAr: l.housingAllowanceAr,
    transportation: l.transportation,
    transportationAr: l.transportationAr,
    annualVacation: l.annualVacation,
    annualVacationAr: l.annualVacationAr,
    ticket: l.ticket,
    ticketAr: l.ticketAr,
    medical: l.medical,
    medicalAr: l.medicalAr,
    contractPeriod: l.contractPeriod,
    contractPeriodAr: l.contractPeriodAr,
    approximateStartingDate: legacyToIso(l.approxStartingDate),
    approximateStartingDateAr: l.approxStartingDateAr,
    probationaryPeriod: l.probationaryPeriod,
    probationaryPeriodAr: l.probationaryPeriodAr,
    comment: l.comment,
  });

  const employmentOfferRepository = {
    async insertHeader(_c, h) {
      const t = table();
      const headerId = String(t.nextHeaderId++);
      t.headers.push({
        headerId,
        uuid: h.uuid,
        offerDate: h.offerDate,
        employeeName: h.employeeName,
        employeeNameAr: h.employeeNameAr ?? null,
        position: h.position,
        status: 'Incomplete', // the SQL literal — write-once, never updated
        division: h.division ?? null,
        applicant: h.applicant ?? '-', // NVL(:applicant, '-')
        to: h.to ?? null,
        toArabic: h.toArabic ?? null,
        intNo: h.intNo ?? null,
        reqNo: h.reqNo ?? 0, // NVL(:reqNo, 0)
        createdBy: h.createdBy,
        createdAt: store.now(),
        updatedBy: null,
        updatedAt: null,
      });
    },
    async findHeaderIdByUuid(_c, uuid) {
      return table().headers.find((h) => h.uuid === uuid)?.headerId ?? null;
    },
    async insertLine(_c, l) {
      if (store.failures.offerInsert) throw new Error('simulated line insert failure');
      const t = table();
      t.lines.push({
        offerLineId: String(t.nextLineId++),
        headerId: l.headerId,
        basicSalary: l.basicSalary ?? 0, // NVL(:basicSalary, 0)
        basicSalaryAr: l.basicSalaryAr ?? null,
        housingAllowance: l.housingAllowance ?? null,
        housingAllowanceAr: l.housingAllowanceAr ?? null,
        transportation: l.transportation ?? null,
        transportationAr: l.transportationAr ?? null,
        annualVacation: l.annualVacation ?? null,
        annualVacationAr: l.annualVacationAr ?? null,
        ticket: l.ticket ?? null,
        ticketAr: l.ticketAr ?? null,
        medical: l.medical ?? null,
        medicalAr: l.medicalAr ?? null,
        contractPeriod: l.contractPeriod ?? null,
        contractPeriodAr: l.contractPeriodAr ?? null,
        approxStartingDate: l.approxStartingDate ?? null,
        approxStartingDateAr: l.approxStartingDateAr ?? null,
        probationaryPeriod: l.probationaryPeriod ?? PROBATION_PERIOD, // NVL default
        probationaryPeriodAr: l.probationaryPeriodAr ?? PROBATION_PERIOD_AR, // NVL default
        attribute2: l.basicSalaryAr ?? null, // legacy salary-arabic duplicate, insert-only
        comment: l.comment ?? null,
        createdBy: l.createdBy,
        createdAt: store.now(),
        updatedBy: null,
        updatedAt: null,
      });
    },

    async findHeader(_c, headerId) {
      const h = headerOf(headerId);
      return h ? toReadHeader(h) : null;
    },
    async findHeaderId(_c, headerId) {
      return headerOf(headerId)?.headerId ?? null;
    },
    async findLine(_c, headerId) {
      const l = lineOf(headerId);
      return l ? toReadLine(l) : null;
    },

    async updateHeader(_c, { headerId, updatedBy, ...fields }) {
      const h = headerOf(headerId);
      if (!h) return false;
      // §5.1 columns only: STATUS, CREATED_BY and CREATION_DATE are never touched.
      Object.assign(h, fields, { updatedBy, updatedAt: store.now() });
      return true;
    },
    async mergeLine(_c, { headerId, createdBy, updatedBy, ...fields }) {
      const t = table();
      const line = lineOf(headerId);
      // Insert-only columns: the MATCHED branch of §5.2 never writes them.
      const { probationaryPeriod, probationaryPeriodAr, ...updatable } = fields;
      if (line) {
        Object.assign(line, updatable, {
          basicSalary: fields.basicSalary ?? 0,
          updatedBy,
          updatedAt: store.now(),
        });
        return;
      }
      t.lines.push({
        offerLineId: String(t.nextLineId++),
        headerId,
        ...fields,
        basicSalary: fields.basicSalary ?? 0,
        probationaryPeriod: probationaryPeriod ?? PROBATION_PERIOD,
        probationaryPeriodAr: probationaryPeriodAr ?? PROBATION_PERIOD_AR,
        attribute2: fields.basicSalaryAr ?? null, // §3.3 insert branch
        createdBy,
        createdAt: store.now(),
        updatedBy: null,
        updatedAt: null,
      });
    },

    async deleteOffer(_c, headerId) {
      const t = table();
      t.lines = t.lines.filter((l) => l.headerId !== headerId);
      if (store.failures.offerDelete) throw new Error('simulated header delete failure');
      const before = t.headers.length;
      t.headers = t.headers.filter((h) => h.headerId !== headerId);
      return before - t.headers.length;
    },

    async listOffers(_c, { limit, offset, filters = {}, createdBy, sortBy, sortDir }) {
      const key = {
        HEADER_ID: (h) => Number(h.headerId),
        OFFER_DATE: (h) => legacyToTime(h.offerDate),
        EMPLOYEE_NAME: (h) => h.employeeName,
        CREATION_DATE: (h) => h.createdAt.getTime(),
      }[sortBy];
      if (!key) throw new Error(`Unsupported sort ${sortBy}`);
      const term = (pattern) =>
        pattern
          .slice(1, -1)
          .replace(/\\([\\%_])/g, '$1')
          .toUpperCase();
      const items = table()
        .headers.filter((h) => {
          const f = filters;
          if (f.search) {
            const needle = term(f.search);
            const haystack = [h.employeeName, h.position, h.employeeNameAr, h.intNo, h.reqNo];
            if (
              !haystack.some((v) =>
                String(v ?? '')
                  .toUpperCase()
                  .includes(needle),
              )
            )
              return false;
          }
          if (f.intNo && String(h.intNo ?? '').toUpperCase() !== f.intNo.toUpperCase())
            return false;
          if (
            f.requisitionNo &&
            String(h.reqNo ?? '').toUpperCase() !== f.requisitionNo.toUpperCase()
          ) {
            return false;
          }
          if (f.division && h.division !== f.division) return false;
          if (f.status && h.status.toUpperCase() !== f.status.toUpperCase()) return false;
          if (f.dateFrom && legacyToTime(h.offerDate) < isoToTime(f.dateFrom)) return false;
          if (f.dateTo && legacyToTime(h.offerDate) >= isoToTime(f.dateTo) + 86_400_000)
            return false;
          if (createdBy !== null && createdBy !== undefined && h.createdBy !== createdBy)
            return false;
          return true;
        })
        .sort((a, b) => {
          const [x, y] = [key(a), key(b)];
          if (x === y) return Number(a.headerId) - Number(b.headerId); // stable tie-breaker (ASC)
          if (x === null) return 1;
          if (y === null) return -1;
          return (x < y ? -1 : 1) * (sortDir === 'desc' ? -1 : 1);
        });
      return {
        total: items.length,
        items: items.slice(offset, offset + limit).map((h) => ({
          headerId: h.headerId,
          offerDate: legacyToIso(h.offerDate),
          employeeName: h.employeeName,
          employeeNameAr: h.employeeNameAr,
          position: h.position,
          division: h.division,
          applicant: h.applicant,
          intNo: h.intNo,
          requisitionNo: h.reqNo, // ATTRIBUTE11 under the listing name
          status: h.status,
          createdBy: h.createdBy,
          creationDate: day(h.createdAt),
          lastUpdateDate: h.updatedAt ? day(h.updatedAt) : null,
        })),
      };
    },

    async isHrUser(_c, userId) {
      return store.state.offerHrUserIds.includes(userId);
    },

    async listCandidates(_c, { excludeOffered = false } = {}) {
      let list = store.state.offerCandidates;
      if (excludeOffered) {
        const offered = new Set(table().headers.map((h) => String(h.intNo)));
        list = list.filter((c) => !offered.has(String(c.intNo)));
      }
      return [...list]
        .sort((a, b) => String(b.requisitionNo ?? '').localeCompare(String(a.requisitionNo ?? '')))
        .map((c) => ({
          headerId: c.headerId,
          intNo: c.intNo,
          candidateName: c.candidateName,
          positionName: c.positionName,
          requisitionNo: c.requisitionNo,
        }));
    },
    async listTitles() {
      return store.state.offerTitles.map((t) => ({
        meaning: t.meaning,
        description: t.description ?? null,
      }));
    },
    async listAllowances(_c, type) {
      const list = store.state.offerAllowances[type];
      if (!list) throw new Error(`Unsupported allowance type ${type}`);
      return list.map((e) => ({ meaning: e.meaning, description: e.description ?? null }));
    },
    async numberToArabic(_c, number) {
      return store.state.offerArabicNumbers[String(number)] ?? null;
    },
    async hijriDate(_c, date) {
      return store.state.offerHijriDates[date] ?? null;
    },
  };

  /**
   * Seeds a complete offer (header + line unless `line: false`) for read/list/delete tests;
   * values use the same normalized shapes the service produces (legacy dates, '-' / 0 defaults).
   */
  function seedOffer({
    headerId,
    createdBy = store.state.users[0]?.userId ?? '100',
    status = 'Incomplete',
    employeeName = 'Test Candidate',
    employeeNameAr = null,
    position = 'Machine Operator',
    division = '300000002689294',
    applicant = '-',
    to = null,
    toArabic = null,
    intNo,
    reqNo = 'REQ-1024',
    offerDate = '25-Oct-2026',
    line = true,
    lineOverrides = {},
  } = {}) {
    const t = table();
    const id = headerId ?? String(t.nextHeaderId++);
    t.headers.push({
      headerId: id,
      uuid: `seed-uuid-${id}`,
      offerDate,
      employeeName,
      employeeNameAr,
      position,
      status,
      division,
      applicant,
      to,
      toArabic,
      intNo: intNo ?? `300000003618177-${id}`,
      reqNo,
      createdBy,
      createdAt: store.now(),
      updatedBy: null,
      updatedAt: null,
    });
    if (line) {
      t.lines.push({
        offerLineId: String(t.nextLineId++),
        headerId: id,
        basicSalary: 8500,
        basicSalaryAr: 'ثمانية آلاف',
        housingAllowance: '25% of basic',
        housingAllowanceAr: 'بدل سكن',
        transportation: 'Transportation',
        transportationAr: 'بدل نقل',
        annualVacation: '21 days',
        annualVacationAr: 'إجازة سنوية',
        ticket: '1 ticket every 2 years',
        ticketAr: 'تذكرة',
        medical: 'Company medical policy',
        medicalAr: 'تأمين طبى',
        contractPeriod: '3 years',
        contractPeriodAr: 'مدة العقد',
        approxStartingDate: '01-Nov-2026',
        approxStartingDateAr: '1448/03/10',
        probationaryPeriod: PROBATION_PERIOD,
        probationaryPeriodAr: PROBATION_PERIOD_AR,
        attribute2: 'ثمانية آلاف', // the insert-only duplicate
        comment: 'Offer per grade X',
        createdBy,
        createdAt: store.now(),
        updatedBy: null,
        updatedAt: null,
        ...lineOverrides,
      });
    }
    return id;
  }

  store.employmentOfferRepository = employmentOfferRepository;
  store.seedOffer = seedOffer;
  return employmentOfferRepository;
}
