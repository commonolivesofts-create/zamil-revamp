import { sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createIdeaController(service) {
  return {
    list: async (req, res) => sendSuccess(res, await service.list(req.auth, req.query)),

    get: async (req, res) => sendSuccess(res, await service.get(req.auth, req.params.headerId)),

    create: async (req, res) => sendSuccess(res, await service.create(req.auth, req.body), 201),

    update: async (req, res) =>
      sendSuccess(res, await service.update(req.auth, req.params.headerId, req.body)),

    remove: async (req, res) =>
      sendSuccess(res, await service.remove(req.auth, req.params.headerId)),

    feasibility: async (req, res) =>
      sendSuccess(res, await service.feasibility(req.auth, req.params.headerId)),

    upload: async (req, res) =>
      sendSuccess(res, await service.upload(req.auth, req.params.headerId, req.files)),

    deleteAttachment: async (req, res) =>
      sendSuccess(
        res,
        await service.deleteAttachment(req.auth, req.params.headerId, req.params.attachmentId),
      ),

    employees: async (req, res) => sendSuccess(res, await service.employees(req.query.q)),

    employee: async (req, res) => sendSuccess(res, await service.employee(req.params.empNo)),

    divisions: async (_req, res) => sendSuccess(res, service.divisions()),

    categories: async (_req, res) => sendSuccess(res, service.categories()),
  };
}
