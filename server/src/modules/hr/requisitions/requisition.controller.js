import { sendPaginated, sendSuccess } from '../../../shared/responses/apiResponse.js';

/** HTTP adapter for the Personal Requisition Form; rules live in requisition.service.js. */
export function createRequisitionController({ requisitionService }) {
  return {
    async list(req, res) {
      const { page, pageSize, ...filters } = req.query;
      const { total, items } = await requisitionService.list(req.auth, {
        page,
        pageSize,
        ...filters,
      });
      sendPaginated(res, items, { page, limit: pageSize, total });
    },
    async get(req, res) {
      sendSuccess(res, await requisitionService.get(req.auth, req.params.requisitionId));
    },
    async create(req, res) {
      // multipart: multer.array('files') puts the parsed uploads directly on `req.files`;
      // for JSON requests it is undefined and the insert carries no attachments.
      sendSuccess(res, await requisitionService.create(req.auth, req.body, req.files), 201);
    },
    async update(req, res) {
      sendSuccess(
        res,
        await requisitionService.update(req.auth, req.params.requisitionId, req.body, req.files),
      );
    },
    async remove(req, res) {
      sendSuccess(res, await requisitionService.remove(req.auth, req.params.requisitionId));
    },
    async uploadAttachments(req, res) {
      sendSuccess(
        res,
        await requisitionService.uploadAttachments(req.auth, req.params.requisitionId, req.files),
        201,
      );
    },
    async removeAttachment(req, res) {
      sendSuccess(
        res,
        await requisitionService.removeAttachment(
          req.auth,
          req.params.requisitionId,
          req.params.attachmentId,
        ),
      );
    },

    // --- Lookups (README §8) --------------------------------------------------------------------

    async jobTitles(req, res) {
      sendSuccess(res, await requisitionService.jobTitles());
    },
    async capabilities(req, res) {
      sendSuccess(res, await requisitionService.capabilities(req.auth));
    },
    async requestor(req, res) {
      sendSuccess(res, await requisitionService.requestor(req.auth));
    },
    async departments(req, res) {
      sendSuccess(res, await requisitionService.departments());
    },
    async replacementFor(req, res) {
      sendSuccess(res, await requisitionService.replacementFor(req.auth));
    },
    async budget(req, res) {
      sendSuccess(res, await requisitionService.budget(req.query.fullName));
    },
    async filterOptions(req, res) {
      sendSuccess(res, await requisitionService.filterOptions(req.auth));
    },
  };
}
