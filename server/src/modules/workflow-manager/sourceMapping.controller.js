import { sendPaginated, sendSuccess } from '../../shared/responses/apiResponse.js';

/** HTTP adapter for Workflow Manager M2-A; rules live in sourceMapping.service.js. */
export function createSourceMappingController({ sourceMappingService: service }) {
  return {
    async dictionary(req, res) {
      sendSuccess(res, await service.dictionary(req.params.sourceId));
    },
    async listVersions(req, res) {
      const { page, pageSize } = req.query;
      const { total, items } = await service.listVersions(req.params.sourceId, { page, pageSize });
      sendPaginated(res, items, { page, limit: pageSize, total });
    },
    async getVersion(req, res) {
      sendSuccess(res, await service.getVersion(req.params.sourceId, req.params.versionId));
    },
    async createVersion(req, res) {
      sendSuccess(res, await service.createVersion(req.auth, req.params.sourceId, req.body), 201);
    },
    async updateVersion(req, res) {
      const { sourceId, versionId } = req.params;
      sendSuccess(res, await service.updateVersion(req.auth, sourceId, versionId, req.body));
    },
    async revalidateVersion(req, res) {
      const { sourceId, versionId } = req.params;
      sendSuccess(res, await service.revalidateVersion(req.auth, sourceId, versionId, req.body));
    },
    async driftVersion(req, res) {
      sendSuccess(res, await service.driftVersion(req.params.sourceId, req.params.versionId));
    },
    async cloneVersion(req, res) {
      const { sourceId, versionId } = req.params;
      sendSuccess(res, await service.cloneVersion(req.auth, sourceId, versionId), 201);
    },
    async deleteVersion(req, res) {
      const { sourceId, versionId } = req.params;
      sendSuccess(res, await service.deleteVersion(req.auth, sourceId, versionId, req.body));
    },
  };
}
