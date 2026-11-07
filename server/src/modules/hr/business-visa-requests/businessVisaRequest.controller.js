import { sendSuccess } from '../../../shared/responses/apiResponse.js';

const wrap =
  (fn, statusCode = 200) =>
  async (req, res, next) => {
    try {
      sendSuccess(res, await fn(req), statusCode);
    } catch (error) {
      next(error);
    }
  };

export function createBusinessVisaRequestController(service) {
  return {
    options: wrap(() => service.options()),
    list: wrap((req) => service.list(req.query)),
    get: wrap((req) => service.get(req.params.id)),
    create: wrap((req) => service.create(req.auth, req.body), 201),
    update: wrap((req) => service.update(req.auth, req.params.id, req.body)),
    remove: wrap((req) => service.remove(req.params.id)),
    addDocument: wrap((req) => service.addDocument(req.params.id, req.file, req.body.name), 201),
    removeDocument: wrap((req) => service.removeDocument(req.params.id, req.params.lineId)),
  };
}
