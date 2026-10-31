import { sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createEmployeeClearanceController({ employeeClearanceService: s }) {
  return {
    list: async (req, res) => sendSuccess(res, await s.list(req.auth, req.query)),

    get: async (req, res) => sendSuccess(res, await s.get(req.auth, req.params.headerId)),

    create: async (req, res) => sendSuccess(res, await s.create(req.auth, req.body), 201),

    update: async (req, res) =>
      sendSuccess(res, await s.update(req.auth, req.params.headerId, req.body)),

    remove: async (req, res) => sendSuccess(res, await s.remove(req.auth, req.params.headerId)),

    employees: async (req, res) => sendSuccess(res, await s.employees(req.auth, req.query)),

    employee: async (req, res) => sendSuccess(res, await s.employee(req.auth, req.params.empNo)),

    approvers: async (req, res) => sendSuccess(res, await s.approvers(req.auth, req.query.section)),

    computerDestinations: async (req, res) =>
      sendSuccess(res, await s.computerDestinations(req.auth)),
  };
}
