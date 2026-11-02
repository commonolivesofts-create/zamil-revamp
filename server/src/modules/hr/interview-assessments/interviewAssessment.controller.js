import { sendPaginated, sendSuccess } from '../../../shared/responses/apiResponse.js';

/** HTTP adapter for the Interview Assessment Form; rules live in interviewAssessment.service.js. */
export function createInterviewAssessmentController({ interviewAssessmentService }) {
  return {
    async list(req, res) {
      const { page, pageSize, ...filters } = req.query;
      const { total, items } = await interviewAssessmentService.list(req.auth, {
        page,
        pageSize,
        ...filters,
      });
      sendPaginated(res, items, { page, limit: pageSize, total });
    },
    async get(req, res) {
      sendSuccess(res, await interviewAssessmentService.get(req.params.headerId));
    },
    async create(req, res) {
      sendSuccess(res, await interviewAssessmentService.create(req.auth, req.body), 201);
    },
    async update(req, res) {
      sendSuccess(
        res,
        await interviewAssessmentService.update(req.auth, req.params.headerId, req.body),
      );
    },
    async remove(req, res) {
      sendSuccess(res, await interviewAssessmentService.remove(req.auth, req.params.headerId));
    },
    async payrollUnits(_req, res) {
      sendSuccess(res, interviewAssessmentService.payrollUnits());
    },
    async nationalities(req, res) {
      sendSuccess(res, await interviewAssessmentService.nationalities());
    },
    async requisitions(req, res) {
      sendSuccess(res, await interviewAssessmentService.requisitions());
    },
    async employees(req, res) {
      sendSuccess(res, await interviewAssessmentService.employees());
    },
  };
}
