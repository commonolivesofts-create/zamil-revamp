import { sendSuccess } from '../../../shared/responses/apiResponse.js';

function wrap(fn, statusCode = 200) {
  return async (req, res, next) => {
    try {
      const result = await fn(req);
      sendSuccess(res, result, statusCode);
    } catch (e) {
      next(e);
    }
  };
}

export function createSickLeaveController(service) {
  return {
    list: wrap((req) => service.list(req.auth, req.query)),

    get: wrap((req) => service.get(req.auth, req.params.headerId)),

    create: wrap((req) => service.create(req.auth, req.body, req.files), 201),

    update: wrap((req) => service.update(req.auth, req.params.headerId, req.body)),

    remove: wrap((req) => service.remove(req.auth, req.params.headerId)),

    upload: wrap((req) => service.upload(req.auth, req.params.headerId, req.files)),

    removeAttachment: wrap((req) =>
      service.removeAttachment(req.auth, req.params.headerId, req.params.attachmentId),
    ),

    employees: wrap((req) => service.employees(req.auth, req.query)),

    employee: wrap((req) => service.employee(req.auth, req.params.empNumber)),
  };
}
