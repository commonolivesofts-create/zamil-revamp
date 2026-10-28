import { randomUUID } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import * as defaultRepository from './employmentOffer.repository.js';
import { BU_VALUES } from './employmentOffer.validation.js';

/*
 * Employment Offer Form rules (README_employment_offer_form.md). `authorize` has already
 * checked the actor's EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS permission; these rules apply on top:
 *   - STATUS is a plain data column: always written 'Incomplete' on insert, never updated.
 *   - Legacy insert defaults: empty applicant stores '-', empty reqNo stores 0; the line's
 *     PROBATIONARY_PERIOD(_AR) defaults are applied by the SQL's NVL when absent (§1.2, §3.3).
 *   - Basic salary accepts a comma string ("8,500") and is stored as a number (§1.2, §9).
 *   - Business dates travel as ISO 'YYYY-MM-DD' and are converted to the stored 'DD-Mon-YYYY'
 *     form (§3.1); reads format them back to ISO.
 *   - PK strategy (§1.3): generate UUID in Node, insert WITHOUT PK columns, read HEADER_ID back
 *     by UUID inside the same transaction; the stale legacy fallbacks 144/230 are never used.
 *   - Listing scope (§7.4) is decided from the actor: HR users see every record, non-HR users
 *     only rows they created — enforced server-side, never from the query string.
 *   - No workflow, no email, no status transitions: STATUS is write-once (README §11).
 * Insert, update and delete each run in ONE transaction covering header + line.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → 'DD-Mon-YYYY' for the TO_DATE(..., 'DD-Mon-YYYY') binds; no timezone. */
export function toLegacyDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${MONTHS[Number(month) - 1]}-${year}`;
}

/** Escapes LIKE wildcards and builds an upper-case contains-pattern for the repository. */
export function searchPattern(search) {
  if (!search) return undefined;
  return `%${search.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Optional strings: absent/empty binds NULL (Oracle treats '' as NULL anyway).
const text = (value) => (value === undefined || value === null || value === '' ? null : value);
// Legacy insert defaults (README §3.3 quirk list): applicant '-', reqNo 0.
const applicant = (value) => (value === undefined || value === null || value === '' ? '-' : value);
const reqNo = (value) => (value === undefined || value === null || value === '' ? 0 : value);

const notFound = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Employment offer not found');

export function createEmploymentOfferService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  /** Header binds shared by insert (§3.3) and update (§5.1); audit ids are added by callers. */
  function headerBinds(body) {
    return {
      offerDate: toLegacyDate(body.offerDate),
      employeeName: body.employeeName,
      employeeNameAr: text(body.employeeNameAr),
      position: body.position,
      division: body.division,
      applicant: applicant(body.applicant),
      to: text(body.to),
      toArabic: text(body.toArabic),
      intNo: body.intNo,
      reqNo: reqNo(body.reqNo),
    };
  }

  /** Line binds for the §3.3 insert and the §5.2 MERGE (same bind names, README §3.3 SQL). */
  function lineBinds(line) {
    return {
      basicSalary: line.basicSalary ?? null,
      basicSalaryAr: text(line.basicSalaryAr),
      housingAllowance: text(line.housingAllowance),
      housingAllowanceAr: text(line.housingAllowanceAr),
      transportation: text(line.transportation),
      transportationAr: text(line.transportationAr),
      annualVacation: text(line.annualVacation),
      annualVacationAr: text(line.annualVacationAr),
      ticket: text(line.ticket),
      ticketAr: text(line.ticketAr),
      medical: text(line.medical),
      medicalAr: text(line.medicalAr),
      contractPeriod: text(line.contractPeriod),
      contractPeriodAr: text(line.contractPeriodAr),
      approxStartingDate: toLegacyDate(line.approximateStartingDate),
      approxStartingDateAr: text(line.approximateStartingDateAr),
      // Absent/empty → NULL → the SQL's NVL applies the hardcoded §1.2 defaults.
      probationaryPeriod: text(line.probationaryPeriod),
      probationaryPeriodAr: text(line.probationaryPeriodAr),
      comment: text(line.comment),
    };
  }

  return {
    async create(actor, body) {
      return withTransaction(POOLS.LOW, async (c) => {
        const uuid = randomUUID();
        await repository.insertHeader(c, {
          ...headerBinds(body),
          uuid,
          createdBy: actor.userId,
        });
        const headerId = await repository.findHeaderIdByUuid(c, uuid);
        if (!headerId) {
          throw new AppError(500, 'OFFER_INSERT_FAILED', 'Employment offer was not created');
        }
        await repository.insertLine(c, {
          ...lineBinds(body.line),
          headerId,
          createdBy: actor.userId,
        });
        return { headerId, uuid };
      });
    },

    async list(actor, { page, pageSize, sortBy, sortDir, search, createdBy, ...rest }) {
      const isHr = await read((c) => repository.isHrUser(c, actor.userId));
      // §7.4: HR users see everything (and may filter by createdBy); non-HR users only their own
      // rows — the scope wins over whatever the caller passed.
      const scope = isHr ? (createdBy ?? null) : actor.userId;
      return read((c) =>
        repository.listOffers(c, {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          filters: { search: searchPattern(search), ...rest },
          createdBy: scope,
          sortBy,
          sortDir,
        }),
      );
    },

    async get(headerId) {
      const [header, line] = await read(async (c) => [
        await repository.findHeader(c, headerId),
        await repository.findLine(c, headerId),
      ]);
      if (!header) throw notFound();
      // A header saved without a line (partial data) reads back as `line: null` (README §4).
      return { ...header, line };
    },

    async update(actor, headerId, body) {
      return withTransaction(POOLS.LOW, async (c) => {
        const existing = await repository.findHeaderId(c, headerId);
        if (!existing) throw notFound();
        const changed = await repository.updateHeader(c, {
          ...headerBinds(body),
          headerId,
          updatedBy: actor.userId,
        });
        if (!changed) throw notFound();
        // MERGE (README §5.2): creates the line when the header was saved without one.
        await repository.mergeLine(c, {
          ...lineBinds(body.line),
          headerId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        });
        return { headerId };
      });
    },

    async remove(actor, headerId) {
      return withTransaction(POOLS.LOW, async (c) => {
        const existing = await repository.findHeaderId(c, headerId);
        if (!existing) throw notFound();
        const deleted = await repository.deleteOffer(c, headerId);
        if (!deleted) throw notFound();
        return { headerId, deleted: true };
      });
    },

    candidates: ({ excludeOffered } = {}) =>
      read((c) => repository.listCandidates(c, { excludeOffered: excludeOffered === true })),

    titles: () => read((c) => repository.listTitles(c)),

    allowances: (type) => read((c) => repository.listAllowances(c, type)),

    /** Raw BU ids only — the legacy labels are contradictory (README §8.9). */
    businessUnits: () => ({ businessUnits: [...BU_VALUES] }),

    numberToArabic: (number) =>
      read(async (c) => ({ output: await repository.numberToArabic(c, number) })),

    hijriDate: (date) => read(async (c) => ({ hijri: await repository.hijriDate(c, date) })),
  };
}
