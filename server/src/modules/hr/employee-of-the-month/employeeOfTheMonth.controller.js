import { sendPaginated, sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createEmployeeOfTheMonthController({ service }) {
  return {
    // Standard paginated envelope (docs/02 §5.2): `pagination` plus meta.requestId.
    async list(req, res) {
      const { items, total } = await service.list(req.auth, req.query);

      sendPaginated(res, items, { page: req.query.page, limit: req.query.pageSize, total });
    },

    async spotlight(_req, res) {
      sendSuccess(res, await service.spotlight());
    },

    async get(req, res) {
      sendSuccess(res, await service.get(req.auth, req.params.headerId));
    },

    async create(req, res) {
      sendSuccess(res, await service.create(req.auth, req.body), 201);
    },

    async update(req, res) {
      sendSuccess(res, await service.update(req.auth, req.params.headerId, req.body));
    },

    async remove(req, res) {
      sendSuccess(res, await service.remove(req.auth, req.params.headerId));
    },

    async employees(req, res) {
      sendSuccess(res, await service.employees(req.query));
    },

    async requestor(req, res) {
      sendSuccess(res, await service.requestor(req.auth));
    },

    async criteria(req, res) {
      sendSuccess(res, service.criteria(req.query.department));
    },
  };
}
