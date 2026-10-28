import { sendPaginated, sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createContractorEmployeeController({ contractorEmployeeService }) {
  return {
    async list(req, res) {
      const result = await contractorEmployeeService.list(req.auth, req.query);
      sendPaginated(res, result.items, {
        page: req.query.page,
        limit: req.query.limit,
        total: result.total,
      });
    },
    async get(req, res) {
      sendSuccess(res, await contractorEmployeeService.get(req.params.empId));
    },
    async create(req, res) {
      sendSuccess(res, await contractorEmployeeService.create(req.auth, req.body), 201);
    },
    async update(req, res) {
      sendSuccess(
        res,
        await contractorEmployeeService.update(req.auth, req.params.empId, req.body),
      );
    },
    async remove(req, res) {
      await contractorEmployeeService.remove(req.params.empId);
      res.status(204).end();
    },
    async lookup(req, res) {
      sendSuccess(res, await contractorEmployeeService.lookup(req.params.name));
    },
    async contractorDetails(req, res) {
      sendSuccess(res, await contractorEmployeeService.contractorDetails(req.params.conNumber));
    },
  };
}
