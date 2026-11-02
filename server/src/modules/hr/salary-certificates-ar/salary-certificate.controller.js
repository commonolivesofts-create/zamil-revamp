
import {
  sendSuccess,
} from '../../../shared/responses/apiResponse.js';

export function createSalaryCertificateController(service) {
  const wrap = (fn, status = 200) =>
    async (req, res, next) => {
      try {
        sendSuccess(
          res,
          await fn(req),
          status
        );
      } catch (error) {
        next(error);
      }
    };

  return {
    create: wrap(
      (req) => service.create(req.body, req.auth),
      201
    ),

    list: wrap(
      (req) => service.list(req.query)
    ),

    read: wrap(
      (req) => service.read(req.params.id)
    ),

    update: wrap(
      (req) =>
        service.update(
          req.params.id,
          req.body,
          req.auth
        )
    ),

    remove: wrap(
      (req) => service.remove(req.params.id)
    ),

    employees: wrap(
      (req) => service.employees(req.query)
    ),

    employee: wrap(
      (req) =>
        service.employee(req.params.empNo)
    ),

    approvers: wrap(
      () => service.approvers()
    ),

    print: async (req, res, next) => {
      try {
        const html = await service.print(
          req.params.id
        );

        res.set('Cache-Control', 'no-store');

        res.type('html').send(html);
      } catch (error) {
        next(error);
      }
    },
  };
}
