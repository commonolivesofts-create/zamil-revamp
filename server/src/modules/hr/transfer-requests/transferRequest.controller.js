import { sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createTransferRequestController({ transferRequestService }) {
  return {
    async list(req, res) {
      sendSuccess(res, await transferRequestService.list(req.auth, req.query));
    },
    async get(req, res) {
      sendSuccess(res, await transferRequestService.get(req.params.headerId));
    },
    async create(req, res) {
      sendSuccess(res, await transferRequestService.create(req.auth, req.body), 201);
    },
    async update(req, res) {
      sendSuccess(
        res,
        await transferRequestService.update(req.auth, req.params.headerId, req.body),
      );
    },
    async remove(req, res) {
      sendSuccess(res, await transferRequestService.remove(req.auth, req.params.headerId));
    },
    async employees(_req, res) {
      sendSuccess(res, await transferRequestService.employees());
    },
    async employeeDetails(req, res) {
      sendSuccess(res, await transferRequestService.employeeDetails(req.params.name));
    },
    async jobs(_req, res) {
      sendSuccess(res, await transferRequestService.jobs());
    },
    async sections(_req, res) {
      sendSuccess(res, await transferRequestService.sections());
    },
    async departments(_req, res) {
      sendSuccess(res, await transferRequestService.departments());
    },
    async directors(_req, res) {
      sendSuccess(res, await transferRequestService.directors());
    },
    async bloodTypes(_req, res) {
      sendSuccess(res, await transferRequestService.bloodTypes());
    },
    async requestor(req, res) {
      sendSuccess(res, await transferRequestService.requestor(req.auth));
    },
  };
}
