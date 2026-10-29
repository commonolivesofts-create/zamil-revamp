import { sendPaginated, sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createPerformanceAppraisalController({ performanceAppraisalService }) {
  return {
    async list(req, res) {
      const { total, items } = await performanceAppraisalService.list(req.auth, req.query);
      sendPaginated(res, items, { page: req.query.page, limit: req.query.pageSize, total });
    },
    async get(req, res) {
      sendSuccess(res, await performanceAppraisalService.get(req.params.headerId));
    },
    async create(req, res) {
      sendSuccess(res, await performanceAppraisalService.create(req.auth, req.body), 201);
    },
    async update(req, res) {
      sendSuccess(res, await performanceAppraisalService.update(req.params.headerId, req.body));
    },
    async employeeRemarks(req, res) {
      sendSuccess(
        res,
        await performanceAppraisalService.employeeRemarks(
          req.auth,
          req.params.headerId,
          req.body.remarks,
        ),
      );
    },
    async remove(req, res) {
      sendSuccess(res, await performanceAppraisalService.remove(req.params.headerId));
    },
    async employees(req, res) {
      sendSuccess(res, await performanceAppraisalService.employees(req.auth, req.query.year));
    },
    async employeeDetails(req, res) {
      sendSuccess(
        res,
        await performanceAppraisalService.employeeDetails(
          req.auth,
          req.params.name,
          req.query.year,
        ),
      );
    },
    async gradeStats(req, res) {
      sendSuccess(res, await performanceAppraisalService.gradeStats(req.auth));
    },
    async requestor(req, res) {
      sendSuccess(res, await performanceAppraisalService.requestor(req.auth));
    },
  };
}
