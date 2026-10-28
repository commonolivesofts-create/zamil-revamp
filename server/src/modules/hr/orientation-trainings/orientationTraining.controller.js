import { sendPaginated, sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createOrientationTrainingController({ orientationTrainingService }) {
  return {
    async list(req, res) {
      const { page, pageSize, ...filters } = req.query;
      const result = await orientationTrainingService.list(req.auth, {
        page,
        pageSize,
        ...filters,
      });
      sendPaginated(res, result.items, { page, limit: pageSize, total: result.total });
    },
    async get(req, res) {
      sendSuccess(res, await orientationTrainingService.get(req.params.headerId));
    },
    async create(req, res) {
      sendSuccess(res, await orientationTrainingService.create(req.auth, req.body), 201);
    },
    async update(req, res) {
      sendSuccess(
        res,
        await orientationTrainingService.update(req.auth, req.params.headerId, req.body),
      );
    },
    async remove(req, res) {
      sendSuccess(res, await orientationTrainingService.remove(req.params.headerId));
    },
    async removeLine(req, res) {
      sendSuccess(
        res,
        await orientationTrainingService.removeLine(req.params.headerId, req.params.lineId),
      );
    },
    async flag(req, res) {
      sendSuccess(res, await orientationTrainingService.flag(req.query.empNo));
    },
    async employees(req, res) {
      sendSuccess(res, await orientationTrainingService.employees(req.auth));
    },
    async managers(_req, res) {
      sendSuccess(res, await orientationTrainingService.managers());
    },
    async employeeDetails(req, res) {
      sendSuccess(res, await orientationTrainingService.employeeDetails(req.query.empNo));
    },
    async skills(req, res) {
      sendSuccess(res, orientationTrainingService.skills(req.query.empType));
    },
  };
}
