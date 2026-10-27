import { randomUUID } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import * as defaultRepository from './interviewAssessment.repository.js';

/*
 * Interview Assessment Form rules (README_interview_assessment_form.md). `authorize` has already
 * checked the actor's INTERVIEW_ASSESSMENTS.INTERVIEW_ASSESSMENTS permission; these rules apply
 * on top:
 *   - STATUS is a plain data column: always written 'Incomplete' on insert, never updated.
 *   - requisitionNo must exist in XXZPI_PER_REQUISITIONS_ALL as REQUISITION_STATUS='Approved' (§9).
 *   - rate9 / cRating7 are recomputed server-side as the sum of the numeric ratings (§9).
 *   - Legacy defaults: empty text stores '-', empty numbers store 0; business dates travel as
 *     ISO 'YYYY-MM-DD' and are converted to the stored 'DD-Mon-YY' form (§3.1, §9).
 *   - Listing scope (§7.4) is decided from the actor: HR users see every record, non-HR users only
 *     rows they created — enforced server-side, never from the query string.
 *   - Delete is refused with 409 when the record is consumed downstream (STATUS 'Approved' and
 *     evaluation 'Passed'; owner decision: uniform guard, no admin bypass).
 * Insert, update and delete each run in ONE transaction covering all four tables.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → 'DD-Mon-YY' for the TO_DATE(..., 'DD-Mon-YY') binds; no timezone involved. */
export function toLegacyDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${MONTHS[Number(month) - 1]}-${year}`;
}

/** Escapes LIKE wildcards and builds an upper-case contains-pattern for the repository. */
export function searchPattern(search) {
  if (!search) return undefined;
  return `%${search.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Legacy display mapping of the listing's statusLabel (README §7.3).
const STATUS_LABELS = Object.freeze({
  Inprocess: 'InProcess',
  Approved: 'Approved',
  Rejected: 'Rejected',
});

const text = (value) => (value === undefined || value === null || value === '' ? '-' : value);
const num = (value) => value ?? 0;
const sumRatings = (values) =>
  values.reduce((sum, value) => (/^[1-5]$/.test(value) ? sum + Number(value) : sum), 0);

const notFound = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Interview assessment not found');

export function createInterviewAssessmentService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  /** §9: the requisition must exist as an approved requisition (checked before any write). */
  async function assertApprovedRequisition(requisitionNo) {
    const exists = await read((c) => repository.approvedRequisitionExists(c, requisitionNo));
    if (!exists) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
        { field: 'requisitionNo', message: 'requisitionNo must be an approved requisition' },
      ]);
    }
  }

  /**
   * Normalizes one full payload into the bind rows of the four tables. `meta` carries the
   * generated headerId/uuid on insert. Header section binds for the update statements are the
   * same values minus the insert-only and mirrored columns (README §5.1/§5.4).
   */
  function prepareSections(body, actorUserId, meta = {}) {
    const personal = body.personalSpec ?? {};
    const competency = body.jobCompetency ?? {};
    const evaluation = body.evaluation;
    const personalSpecTotal = sumRatings(
      [
        personal.rate1,
        personal.rate2,
        personal.rate3,
        personal.rate4,
        personal.rate5,
        personal.rate6,
        personal.rate7,
        personal.rate8,
      ].map(text),
    );
    const jobCompetencyTotal = sumRatings(
      [
        competency.cRating1,
        competency.cRating2,
        competency.cRating3,
        competency.cRating4,
        competency.cRating5,
        competency.cRating6,
      ].map(text),
    );
    const personalSpecResult = text(personal.remarks);
    const jobCompetencyResult = text(competency.cRemarks);

    const common = {
      candidateName: body.candidateName,
      positionName: body.positionName,
      nationality: text(body.nationality),
      maritalStatus: text(body.materialStatus),
      age: num(body.age),
      interviewDate: body.interviewDate ? toLegacyDate(body.interviewDate) : null,
      interviewTime: text(body.interviewTime),
      interviewType: text(body.interviewType),
      secondaryEducation: text(body.secondaryEducation),
      secondaryEducationChk: text(body.secondaryEducationChk),
      lastPositionHeld: text(body.lastPositionHeld),
      companyName: text(body.companyName),
      relevantYearsExperience: num(body.relevantYearsExperience),
      requisitionNo: body.requisitionNo,
      location: text(body.location),
      currentEmployer: text(body.currentEmployer),
      joining: body.joining ? toLegacyDate(body.joining) : null,
      major: text(body.major),
      division: text(body.division),
      curSalBasic: body.curSalBasic ?? null,
      expSalBasic: body.expSalBasic ?? null,
      curSalTotal: body.curSalTotal ?? null,
      expSalTotal: body.expSalTotal ?? null,
    };

    const personalSpec = {
      rate1: text(personal.rate1),
      remark1: text(personal.remark1),
      rate2: text(personal.rate2),
      remark2: text(personal.remark2),
      rate3: text(personal.rate3),
      remark3: text(personal.remark3),
      rate4: text(personal.rate4),
      remark4: text(personal.remark4),
      rate5: text(personal.rate5),
      remark5: text(personal.remark5),
      rate6: text(personal.rate6),
      remark6: text(personal.remark6),
      rate7: text(personal.rate7),
      remark7: text(personal.remark7),
      rate8: text(personal.rate8),
      remark8: text(personal.remark8),
    };

    const jobCompetency = {
      cRating1: text(competency.cRating1),
      cRemark1: text(competency.cRemark1),
      cRating2: text(competency.cRating2),
      cRemark2: text(competency.cRemark2),
      cRating3: text(competency.cRating3),
      cRemark3: text(competency.cRemark3),
      cRating4: text(competency.cRating4),
      cRemark4: text(competency.cRemark4),
      cRating5: text(competency.cRating5),
      cRemark5: text(competency.cRemark5),
      cRating6: text(competency.cRating6),
      cRemark6: text(competency.cRemark6),
      sumStrength: text(competency.sumStrength),
      sumWeekness: text(competency.sumWeekness),
    };

    const evaluationBinds = {
      evalStatus: evaluation.status,
      evalInterviewedBy: text(evaluation.interviewedBy),
      adminManager: text(evaluation.adminManager),
      managningDirector: text(evaluation.managningDirector),
      hrRep: text(evaluation.hrRep),
      comment: text(evaluation.comment),
      deptRep: text(evaluation.deptRep),
    };

    return {
      headerSection: { ...common },
      personalSpec,
      jobCompetency,
      evaluation: evaluationBinds,
      totals: { personalSpecTotal, personalSpecResult, jobCompetencyTotal, jobCompetencyResult },
      insertHeader: {
        ...common,
        ...meta, // { headerId, uuid }
        intNo: `${body.attribute3}-${String(meta.headerId).padStart(3, '0')}`,
        attribute3: body.attribute3,
        interviewedBy: text(body.interviewedBy),
        interviewedBy2: text(body.interviewedBy2),
        interviewedBy3: text(body.interviewedBy3),
        personalSpecTotal,
        personalSpecResult,
        jobCompetencyTotal,
        jobCompetencyResult,
        status: 'Incomplete',
        createdBy: actorUserId,
      },
      insertPersonalSpec: { ...personalSpec, headerId: meta.headerId, createdBy: actorUserId },
      insertJobCompetency: { ...jobCompetency, headerId: meta.headerId, createdBy: actorUserId },
      insertEvaluation: { ...evaluationBinds, headerId: meta.headerId, createdBy: actorUserId },
      audit: { createdBy: actorUserId, updatedBy: actorUserId },
    };
  }

  async function toDetail(headerId) {
    const header = await read((c) => repository.findHeader(c, headerId));
    if (!header) throw notFound();
    const [personalSpec, jobCompetency, evaluation] = await read(async (c) => [
      await repository.findPersonalSpec(c, headerId),
      await repository.findJobCompetency(c, headerId),
      await repository.findEvaluation(c, headerId),
    ]);
    // Totals/results live on the header but belong to the payload sections (README §3.2, §4).
    const {
      personalSpecTotal,
      personalSpecResult,
      jobCompetencyTotal,
      jobCompetencyResult,
      ...rest
    } = header;
    return {
      ...rest,
      personalSpec: personalSpec && {
        ...personalSpec,
        rate9: personalSpecTotal,
        remarks: personalSpecResult,
      },
      jobCompetency: jobCompetency && {
        ...jobCompetency,
        cRating7: jobCompetencyTotal,
        cRemarks: jobCompetencyResult,
      },
      evaluation,
    };
  }

  return {
    async create(actor, body) {
      await assertApprovedRequisition(body.requisitionNo);
      return withTransaction(POOLS.LOW, async (c) => {
        const headerId = await repository.generateHeaderId(c);
        const uuid = randomUUID();
        const sections = prepareSections(body, actor.userId, { headerId, uuid });
        await repository.insertHeader(c, sections.insertHeader);
        await repository.insertPersonalSpec(c, sections.insertPersonalSpec);
        await repository.insertJobCompetency(c, sections.insertJobCompetency);
        await repository.insertEvaluation(c, sections.insertEvaluation);
        return { headerId, intNo: sections.insertHeader.intNo, uuid };
      });
    },

    async list(actor, { page, pageSize, sortBy, sortDir, search, createdBy, ...rest }) {
      const isHr = await read((c) => repository.isHrUser(c, actor.userId));
      // §7.4: HR users see everything (and may filter by createdBy); non-HR users only their own
      // rows — the scope wins over whatever the caller passed.
      const scope = isHr ? (createdBy ?? null) : actor.userId;
      const { total, items } = await read((c) =>
        repository.listAssessments(c, {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          filters: { search: searchPattern(search), ...rest },
          createdBy: scope,
          sortBy,
          sortDir,
        }),
      );
      return {
        total,
        items: items.map((item) => ({
          ...item,
          statusLabel: STATUS_LABELS[item.headerStatus] ?? 'Draft',
          evaluationStatus: item.headerStatus === 'Approved' ? item.evaluationStatus : null,
        })),
      };
    },

    get: (headerId) => toDetail(headerId),

    async update(actor, headerId, body) {
      await assertApprovedRequisition(body.requisitionNo);
      return withTransaction(POOLS.LOW, async (c) => {
        const existing = await repository.findHeaderStatus(c, headerId);
        if (!existing) throw notFound();
        const sections = prepareSections(body, actor.userId);
        const changed = await repository.updateHeaderSection(c, {
          ...sections.headerSection,
          headerId,
          updatedBy: actor.userId,
        });
        if (!changed) throw notFound();
        await repository.mergePersonalSpec(c, {
          ...sections.personalSpec,
          headerId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        });
        await repository.updateHeaderPersonalTotals(c, {
          headerId,
          personalSpecTotal: sections.totals.personalSpecTotal,
          personalSpecResult: sections.totals.personalSpecResult,
          updatedBy: actor.userId,
        });
        await repository.mergeJobCompetency(c, {
          ...sections.jobCompetency,
          headerId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        });
        await repository.updateHeaderCompetencyTotals(c, {
          headerId,
          jobCompetencyTotal: sections.totals.jobCompetencyTotal,
          jobCompetencyResult: sections.totals.jobCompetencyResult,
          updatedBy: actor.userId,
        });
        await repository.mergeEvaluation(c, {
          ...sections.evaluation,
          headerId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        });
        await repository.updateHeaderMirror(c, {
          headerId,
          evalInterviewedBy: sections.evaluation.evalInterviewedBy,
          interviewedBy2: text(body.interviewedBy2),
          interviewedBy3: text(body.interviewedBy3),
          attribute3: body.attribute3,
          updatedBy: actor.userId,
        });
        return { headerId };
      });
    },

    async remove(actor, headerId) {
      return withTransaction(POOLS.LOW, async (c) => {
        const existing = await repository.findHeaderStatus(c, headerId);
        if (!existing) throw notFound();
        // Downstream guard (README §6): the Employment Offer form consumes Approved+Passed rows.
        if (existing.status === 'Approved') {
          const evaluationStatus = await repository.findEvaluationStatus(c, headerId);
          if (evaluationStatus === 'Passed') {
            throw new AppError(
              409,
              'CANNOT_DELETE_APPROVED',
              'Cannot delete an approved interview assessment',
            );
          }
        }
        const deleted = await repository.deleteAssessment(c, headerId);
        if (!deleted) throw notFound();
        return { headerId, deleted: true };
      });
    },

    nationalities: () => read((c) => repository.listNationalities(c)),
    requisitions: () => read((c) => repository.listApprovedRequisitions(c)),
    employees: () => read((c) => repository.listEmployeeNames(c)),
  };
}
