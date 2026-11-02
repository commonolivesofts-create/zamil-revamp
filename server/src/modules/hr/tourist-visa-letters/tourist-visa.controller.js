import { sendSuccess } from '../../../shared/responses/apiResponse.js';

export function createTouristVisaController(service) {
  const wrap =
    (fn, status = 200) =>
    async (req, res, next) => {
      try {
        sendSuccess(res, await fn(req), status);
      } catch (error) {
        next(error);
      }
    };

  return {
    create: wrap((req) => service.create(req.body, req.auth), 201),

    read: wrap((req) => service.read(req.params.uuid)),

    update: wrap((req) => service.update(req.params.uuid, req.body, req.auth)),

    remove: wrap((req) => service.remove(req.params.uuid)),

    list: wrap((req) => service.list(req.query)),

    countries: wrap(() => service.countries()),

    country: wrap((req) => service.country(req.params.country)),

    employees: wrap((req) => service.employees(req.query.q)),

    employee: wrap((req) => service.employee(req.params.empNo)),

    approvers: wrap(() => service.approvers()),

    print: wrap((req) => service.print(req.params.uuid)),
  };
}
