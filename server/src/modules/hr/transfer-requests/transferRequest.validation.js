import Joi from 'joi';

const ID = /^[1-9][0-9]{0,18}$/;
const CONTROLS = /^[^\p{Cc}]*$/u;
const dateShape = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return helpers.error('date.invalid');
    }
    return value;
  })
  .messages({ 'date.invalid': '{{#label}} must be a real calendar date in YYYY-MM-DD format' });
const optionalText = (max) => Joi.string().trim().max(max).pattern(CONTROLS).allow('', null);

export const PLANTS = Object.freeze(['Zamil Plastic Non-Food', 'Zamil Plastic Food']);

export const DEPARTMENTS = Object.freeze([
  'Sales Department',
  'Planning Department',
  'Warehouse Department',
  'Production Department',
  'Maintenance Department',
  'Technical Department',
  'Quality Department',
  'HR Department',
  'Finance Department',
  'IT Department',
  'Purchasing Department',
]);

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});
export const headerIdParams = Joi.object({
  headerId: Joi.string().pattern(ID).required(),
});
export const employeeNameParams = Joi.object({
  name: Joi.string().trim().min(1).max(200).pattern(CONTROLS).required(),
});

export const listQuerySchema = Joi.object({
  search: Joi.string().trim().max(100).pattern(CONTROLS).allow(''),
  status: Joi.string().trim().max(50).pattern(CONTROLS),
  plant: Joi.string().valid(...PLANTS),
  transferDept: Joi.string().trim().max(200).pattern(CONTROLS),
  currentDept: Joi.string().trim().max(200).pattern(CONTROLS),
  jobTitle: Joi.string().trim().max(200).pattern(CONTROLS),
  date_from: dateShape,
  date_to: dateShape,
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(25),
  sort: Joi.string()
    .valid('headerId', 'requestedBy', 'empName', 'currentJob', 'transferJob', 'status', 'mgrDate')
    .default('headerId'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
});

// Keep business enum/reference checks in the service so each documented rule can return
// its field-specific error code. These schemas enforce shape and reject mass assignment.
const current = Joi.object({
  empNo: Joi.alternatives().try(Joi.number().integer(), Joi.string().pattern(/^\d{1,19}$/)),
  empName: optionalText(200),
  dateOfJoining: dateShape.allow(null, ''),
  jobTitle: optionalText(200),
  dept: optionalText(200),
  section: optionalText(200),
});

const transfer = Joi.object({
  jobTitle: optionalText(200),
  dept: optionalText(200),
  section: optionalText(200),
  effectiveDate: Joi.string().allow('', null),
  bloodType: optionalText(50),
  superiorNo: Joi.alternatives().try(Joi.number().integer(), Joi.string().pattern(/^\d{1,19}$/)),
  superiorName: optionalText(200),
  changeSalary: optionalText(10),
  budgetedSalary: optionalText(10),
});

const itHr = Joi.object({
  hrSignature: optionalText(500),
  hrDate: dateShape.allow(null, ''),
  itSignature: optionalText(500),
  itDate: dateShape.allow(null, ''),
  adminSignature: optionalText(500),
  adminDate: dateShape.allow(null, ''),
});

const serverOwned = {
  headerId: Joi.any(),
  uuid: Joi.any(),
  status: Joi.any(),
  createdBy: Joi.any(),
  signature: Joi.any(),
  approvals: Joi.any(),
};

export const writeBodySchema = Joi.object({
  ...serverOwned,
  plant: Joi.string().max(100),
  requestedBy: optionalText(200),
  mgrDate: dateShape.allow(null, ''),
  current,
  transfer,
  itHr,
});
