import { sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createSurveyReportController({ surveyReportService: service }) {
  return {
    meta: async (_req, res) => {
      return sendSuccess(res, await service.meta());
    },

    create: async (req, res) => {
      const result = await service.create(req.body, req.ip);

      return sendSuccess(res, result, 201);
    },

    list: async (req, res) => {
      return sendSuccess(res, await service.list(req.query));
    },

    get: async (req, res) => {
      return sendSuccess(res, await service.get(req.params.headerId));
    },

    remove: async (req, res) => {
      return sendSuccess(res, await service.remove(req.params.headerId));
    },

    questions: async (_req, res) => {
      return sendSuccess(res, await service.questions());
    },

    filters: async (_req, res) => {
      return sendSuccess(res, await service.filters());
    },

    questionFilters: async (req, res) => {
      return sendSuccess(res, await service.questionFilters(req.body.question_key));
    },

    distribution: async (req, res) => {
      return sendSuccess(res, await service.distribution(req.body));
    },

    categoryScore: async (req, res) => {
      return sendSuccess(res, await service.categoryScore(req.body));
    },

    yearwise: async (req, res) => {
      return sendSuccess(res, await service.yearwise(req.body));
    },

    categoryDepartment: async (req, res) => {
      return sendSuccess(res, await service.categoryDepartment(req.query));
    },
  };
}
