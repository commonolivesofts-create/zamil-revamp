import { sendPaginated, sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createProbationEvaluationController({ probationEvaluationService }) {
  return {
    async list(req, res) {
      const { page, pageSize, ...filters } = req.query;
      const { total, items } = await probationEvaluationService.list(req.auth, {
        page,
        pageSize,
        ...filters,
      });
      sendPaginated(res, items, { page, limit: pageSize, total });
    },
    async get(req, res) {
      sendSuccess(res, await probationEvaluationService.get(req.params.headerId));
    },
    async create(req, res) {
      sendSuccess(res, await probationEvaluationService.create(req.auth, req.body), 201);
    },
    async update(req, res) {
      sendSuccess(res, await probationEvaluationService.update(req.params.headerId, req.body));
    },
    async remove(req, res) {
      sendSuccess(res, await probationEvaluationService.remove(req.params.headerId));
    },
    async formTypes(_req, res) {
      sendSuccess(res, probationEvaluationService.formTypes());
    },
    async employees(req, res) {
      sendSuccess(res, await probationEvaluationService.employees(req.auth));
    },
    async requestor(req, res) {
      sendSuccess(res, await probationEvaluationService.requestor(req.auth));
    },
    async employeeDetails(req, res) {
      sendSuccess(
        res,
        await probationEvaluationService.employeeDetails(req.auth, req.query.empName),
      );
    },
  };
}
