import { sendSuccess } from '../../../shared/responses/apiResponse.js';

export const createPersonalStatusController = (service) => {
  const handle =
    (action, status = 200) =>
    async (req, res, next) => {
      try {
        sendSuccess(res, await action(req), status);
      } catch (error) {
        return next(error);
      }
    };

  return {
    create: handle((req) => service.create(req.body, req.auth), 201),

    read: handle((req) => service.read(req.params.headerId)),

    update: handle((req) => service.update(req.params.headerId, req.body, req.auth)),

    remove: handle((req) => service.delete(req.params.headerId)),

    list: handle((req) => service.list(req.query)),

    employees: handle(() => service.employees()),

    positions: handle(() => service.positions()),

    autoFill: handle((req) => service.autoFill(req.params.empNo)),
  };
};
