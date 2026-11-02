import { sendPaginated, sendSuccess } from '../../shared/responses/apiResponse.js';

/** HTTP adapter for Workflow Manager M1; rules live in workflowManager.service.js. */
export function createWorkflowManagerController({ workflowManagerService: service }) {
  const paginated = (list) => async (req, res) => {
    const { page, pageSize } = req.query;
    const { total, items } = await list(req.query);
    sendPaginated(res, items, { page, limit: pageSize, total });
  };

  return {
    async overview(req, res) {
      sendSuccess(res, await service.overview(req.auth));
    },

    listForms: paginated((query) => service.listForms(query)),
    async getForm(req, res) {
      sendSuccess(res, await service.getForm(req.params.formId));
    },
    async listFormVersions(req, res) {
      sendSuccess(res, await service.listFormVersions(req.params.formId));
    },
    async createForm(req, res) {
      sendSuccess(res, await service.createForm(req.auth, req.body), 201);
    },
    async updateForm(req, res) {
      sendSuccess(res, await service.updateForm(req.auth, req.params.formId, req.body));
    },
    async activateForm(req, res) {
      sendSuccess(res, await service.setFormActive(req.auth, req.params.formId, true, req.body));
    },
    async deactivateForm(req, res) {
      sendSuccess(res, await service.setFormActive(req.auth, req.params.formId, false, req.body));
    },
    async modules(_req, res) {
      sendSuccess(res, await service.listModules());
    },

    listSources: paginated((query) => service.listSources(query)),
    async getSource(req, res) {
      sendSuccess(res, await service.getSource(req.params.sourceId));
    },
    async listSourceVersions(req, res) {
      sendSuccess(res, await service.listSourceVersions(req.params.sourceId));
    },
    async createSource(req, res) {
      sendSuccess(res, await service.createSource(req.auth, req.body), 201);
    },
    async updateSource(req, res) {
      sendSuccess(res, await service.updateSource(req.auth, req.params.sourceId, req.body));
    },
    async activateSource(req, res) {
      sendSuccess(
        res,
        await service.setSourceActive(req.auth, req.params.sourceId, true, req.body),
      );
    },
    async deactivateSource(req, res) {
      sendSuccess(
        res,
        await service.setSourceActive(req.auth, req.params.sourceId, false, req.body),
      );
    },
    async sourceObjects(req, res) {
      sendSuccess(res, await service.listSourceObjects(req.query));
    },
    sourcePolicy(_req, res) {
      sendSuccess(res, service.sourcePolicy());
    },
  };
}
