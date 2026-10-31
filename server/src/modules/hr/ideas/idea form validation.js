import Joi from 'joi';

const ids = Joi.string()
  .pattern(/^[1-9][0-9]*$/)
  .required();

const numeric = Joi.alternatives().try(
  Joi.number().min(0),
  Joi.string().pattern(/^[0-9][0-9,']*(\.[0-9]+)?$/),
);

export const idParams = Joi.object({
  headerId: ids,
});

export const attachmentParams = Joi.object({
  headerId: ids,
  attachmentId: ids,
});

export const empty = Joi.object({});

export const listQuery = Joi.object({
  status: Joi.string().max(30),
  idNo: Joi.string().max(100),
  empNo: Joi.string().max(100),
  division: Joi.string().max(30),
  invCategory: Joi.string().max(30),
  category: Joi.string().max(30),
  from: Joi.date().iso().raw(),
  to: Joi.date().iso().raw(),
  q: Joi.string().max(200),
  mine: Joi.boolean(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(25),
});

export const searchQuery = Joi.object({
  q: Joi.string().max(100).allow(''),
});

export const empParams = Joi.object({
  empNo: Joi.string().max(30).required(),
});

export const writeBody = Joi.object({
  empNo: Joi.string().trim().required(),

  empName: Joi.string().allow('', null),
  department: Joi.string().allow('', null),

  division: Joi.string().valid('300000003618177', '300000003618190').required(),

  title: Joi.string().trim().max(200).required(),

  idea: Joi.string().allow('', null),

  projectType: Joi.string()
    .valid('innovation', 'development', 'environmental', 'automation')
    .required(),

  investmentCategory: Joi.string()
    .valid(
      'machine',
      'robot',
      'tools',
      'mold',
      'auxiliary',
      'building',
      'computer',
      'material',
      'exchange_rate',
    )
    .required(),

  hasInvestment: Joi.string().valid('yes', 'no').required(),

  investmentValue: numeric,
  saving: numeric,
});
