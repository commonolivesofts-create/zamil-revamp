import Joi from 'joi';

// Legacy visa_request (Visa.php / Visa_model.php): the Business Visa Request form for a visitor
// coming to the company. The legacy APP_BU_INFO divisions, served by GET /lookups/options.
export const DIVISIONS = Object.freeze([
  Object.freeze({ code: '300000003618177', name: 'IPP' }),
  Object.freeze({ code: '300000003618190', name: 'FPP' }),
]);

export const STATUSES = Object.freeze(['DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED', 'ACCEPTED']);

const iso = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const [y, m, d] = value.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
      ? value
      : helpers.error('date.invalid');
  });

// Every legacy column is VARCHAR2(500).
const required = (max = 500) => Joi.string().trim().min(1).max(max).required();
const optional = (max = 500) => Joi.string().trim().max(max).allow('').default('');

export const idParams = Joi.object({
  id: Joi.string()
    .pattern(/^[1-9]\d{0,18}$/)
    .required(),
});

export const documentParams = Joi.object({
  id: Joi.string()
    .pattern(/^[1-9]\d{0,18}$/)
    .required(),
  lineId: Joi.string()
    .pattern(/^[1-9]\d{0,18}$/)
    .required(),
});

export const empty = Joi.object({});

export const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(25),
  q: Joi.string().trim().max(200).allow(''),
  status: Joi.string()
    .valid(...STATUSES)
    .allow(''),
  division: Joi.string().trim().max(500).allow(''),
  dept: Joi.string().trim().max(500).allow(''),
  dateFrom: iso.allow(''),
  dateTo: iso.allow(''),
});

// The legacy form's required fields (address and "if other" were optional). Visa type and the
// expense boxes are check boxes; the server stores the legacy literals ('Single', 'Null', …).
export const writeBody = Joi.object({
  division: Joi.string()
    .valid(...DIVISIONS.map((item) => item.code))
    .required(),
  dept: required(),
  requestDate: iso.required(),
  visitorName: required(),
  visitorPhone: required(),
  nationality: required(),
  profession: required(),
  passportNo: required(),
  issueDate: iso.required(),
  expiryDate: iso.required(),
  companyName: required(),
  address: optional(),
  tel: required(),
  fax: required(),
  arrivalDate: iso.required(),
  comingFrom: required(),
  travelRoute: required(),
  visitPurpose: required(),
  saudiEmbassy: required(),
  visaSingle: Joi.boolean().default(false),
  visaMultiple: Joi.boolean().default(false),
  travelCompany: Joi.boolean().default(false),
  travelPersonal: Joi.boolean().default(false),
  travelOther: Joi.boolean().default(false),
  hotelCompany: Joi.boolean().default(false),
  hotelPersonal: Joi.boolean().default(false),
  hotelOther: Joi.boolean().default(false),
  otherDetails: optional(),
})
  .custom((value, helpers) => {
    if (value.expiryDate < value.issueDate)
      return helpers.message('expiryDate must not be before issueDate');
    if (!value.visaSingle && !value.visaMultiple) return helpers.message('Choose the visa type');
    if (value.visaSingle && value.visaMultiple)
      return helpers.message('Choose either the single or the multiple visa type, not both');
    if ((value.travelOther || value.hotelOther) && !value.otherDetails) {
      return helpers.message('otherDetails is required when "Others" is chosen');
    }
    return value;
  })
  .unknown(false);

export const documentBody = Joi.object({
  name: Joi.string().trim().max(500).allow('').default(''),
});
