import { sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createProjectCharterController({ projectCharterService: s }) {
  return {
    async list(req, res) {
      sendSuccess(res, await s.list(req.auth, req.query));
    },

    async get(req, res) {
      sendSuccess(res, await s.get(req.auth, req.params.headerId));
    },

    async create(req, res) {
      sendSuccess(res, await s.create(req.auth, req.body), 201);
    },

    async update(req, res) {
      sendSuccess(res, await s.update(req.auth, req.params.headerId, req.body));
    },

    async remove(req, res) {
      sendSuccess(res, await s.remove(req.auth, req.params.headerId));
    },

    async reward(req, res) {
      sendSuccess(res, await s.reward(req.auth, req.params.headerId));
    },

    async updateReward(req, res) {
      sendSuccess(res, await s.updateReward(req.auth, req.params.headerId, req.body));
    },

    async ideas(req, res) {
      sendSuccess(res, await s.ideas());
    },

    async idea(req, res) {
      sendSuccess(res, await s.idea(req.auth, req.params.ideaId));
    },

    async employees(req, res) {
      sendSuccess(res, await s.employees(req.auth, req.query));
    },

    async employee(req, res) {
      sendSuccess(res, await s.employee(req.auth, req.params.empNo));
    },
  };
}
