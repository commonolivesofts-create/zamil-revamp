import { sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createEmployeeOfTheMonthController({ service }) {
  return {
    async list(req, res) {
      const { items, total } = await service.list(req.auth, req.query);

      res.status(200).json({
        success: true,
        data: items,
        meta: {
          page: req.query.page,
          pageSize: req.query.pageSize,
          total,
          totalPages: Math.ceil(total / req.query.pageSize),
        },
      });
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
