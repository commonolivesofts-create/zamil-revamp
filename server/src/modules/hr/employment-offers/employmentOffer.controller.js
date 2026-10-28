import { sendPaginated, sendSuccess } from '../../../shared/responses/apiResponse.js';

/** HTTP adapter for the Employment Offer Form; rules live in employmentOffer.service.js. */
export function createEmploymentOfferController({ employmentOfferService }) {
  return {
    async list(req, res) {
      const { page, pageSize, ...filters } = req.query;
      const { total, items } = await employmentOfferService.list(req.auth, {
        page,
        pageSize,
        ...filters,
      });
      sendPaginated(res, items, { page, limit: pageSize, total });
    },
    async get(req, res) {
      sendSuccess(res, await employmentOfferService.get(req.params.headerId));
    },
    async create(req, res) {
      sendSuccess(res, await employmentOfferService.create(req.auth, req.body), 201);
    },
    async update(req, res) {
      sendSuccess(
        res,
        await employmentOfferService.update(req.auth, req.params.headerId, req.body),
      );
    },
    async remove(req, res) {
      sendSuccess(res, await employmentOfferService.remove(req.auth, req.params.headerId));
    },
    async candidates(req, res) {
      sendSuccess(res, await employmentOfferService.candidates(req.query));
    },
    async titles(req, res) {
      sendSuccess(res, await employmentOfferService.titles());
    },
    async allowances(req, res) {
      sendSuccess(res, await employmentOfferService.allowances(req.query.type));
    },
    async businessUnits(req, res) {
      sendSuccess(res, await employmentOfferService.businessUnits());
    },
    async numberToArabic(req, res) {
      sendSuccess(res, await employmentOfferService.numberToArabic(req.query.number));
    },
    async hijriDate(req, res) {
      sendSuccess(res, await employmentOfferService.hijriDate(req.query.date));
    },
  };
}
