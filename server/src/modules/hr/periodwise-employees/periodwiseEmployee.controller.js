import { sendPaginated, sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createPeriodwiseEmployeeController({ periodwiseEmployeeService }) {
  return {
    async report(req, res) {
      const { items, total, summary } = await periodwiseEmployeeService.report(req.query);
      // The summary describes the whole scope, so it travels inside data next to this page's rows.
      sendPaginated(
        res,
        { rows: items, summary },
        { page: req.query.page, limit: req.query.pageSize, total },
      );
    },
    async departments(_req, res) {
      sendSuccess(res, await periodwiseEmployeeService.departments());
    },
  };
}
