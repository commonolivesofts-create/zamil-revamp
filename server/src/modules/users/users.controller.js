import { requestContext } from '../../middleware/authenticate.js';
import { sendPaginated, sendSuccess } from '../../shared/responses/apiResponse.js';
import { searchPattern } from './users.service.js';

/** HTTP adapter for user administration; rules live in users.service.js. */
export function createUsersController({ usersService }) {
  const ctx = requestContext;

  return {
    async listUsers(req, res) {
      const { page, limit, search, status, mfaEnrolled, locked, sortBy, sortOrder } = req.query;
      const { total, items } = await usersService.listUsers({
        limit,
        offset: (page - 1) * limit,
        filters: { search: searchPattern(search), status, mfaEnrolled, locked },
        sortBy,
        sortOrder,
      });
      sendPaginated(res, items, { page, limit, total });
    },
    async listCandidates(req, res) {
      const { page, limit, search, hasAccount } = req.query;
      const { total, items } = await usersService.listCandidates({
        limit,
        offset: (page - 1) * limit,
        search,
        hasAccount,
      });
      sendPaginated(res, items, { page, limit, total });
    },
    async getUser(req, res) {
      sendSuccess(res, await usersService.getUser(req.params.userId));
    },
    async provision(req, res) {
      sendSuccess(res, await usersService.provision(req.auth, req.body, ctx(req)), 201);
    },
    async activate(req, res) {
      sendSuccess(res, await usersService.activate(req.auth, req.params.userId, ctx(req)));
    },
    async disable(req, res) {
      sendSuccess(res, await usersService.disable(req.auth, req.params.userId, ctx(req)));
    },
    async revokeSessions(req, res) {
      sendSuccess(res, await usersService.revokeSessions(req.auth, req.params.userId, ctx(req)));
    },
    async revokeSession(req, res) {
      const { userId, sessionId } = req.params;
      sendSuccess(res, await usersService.revokeSession(req.auth, userId, sessionId, ctx(req)));
    },
  };
}
