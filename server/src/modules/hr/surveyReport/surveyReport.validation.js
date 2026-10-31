import Joi from 'joi';

export const SECTIONS = Object.freeze([
  ['relation', 5, 10, 'Relationship With Organization', 'العلاقة مع المنظمة'],
  ['teamwork', 3, 20, 'Teamwork', 'العمل الجماعي'],
  ['info', 3, 30, 'Information', 'المعلومات'],
  ['official', 4, 40, 'Relationship With Officials', 'العلاقة مع المسؤولين'],
  ['career', 7, 50, 'Passion For Career', 'الشغف الوظيفي'],
  ['notes', 2, 60, 'Notes', 'الملاحظات'],
  ['work', 3, 70, 'Work / Life Balance', 'توازن العمل/الحياة'],
  ['fairness', 2, 80, 'Fairness At Work', 'العدل في العمل'],
]);

export const QUESTIONS = Object.freeze(
  SECTIONS.flatMap(([section, count, code, en, ar], sectionIndex) => {
    const previousCount = SECTIONS.slice(0, sectionIndex).reduce(
      (total, item) => total + item[1],
      0,
    );

    return Array.from({ length: count }, (_, index) => ({
      key: `${section}_${index + 1}`,
      slot: previousCount + index + 1,
      section,
      code,
      title: { en, ar },
    }));
  }),
);

export const DEMOGRAPHICS = Object.freeze({
  age: ['20-29', '30-39', '40-49', '50-59', '60 or More'],

  jobLevel: ['Manager', 'Supervisor', 'Office Staff', 'Engineer', 'Workers'],

  department: [
    'Administration & HR',
    'Purchasing',
    'Finance',
    'Production Food',
    'Production Non- food',
    'Warehouse',
    'Quality',
    'IT',
    'Technical And Development Moulding',
    'Sales Marketing food',
    'Sales Marketing Non- food',
    'Planning Section',
    'Maintenance Section',
  ],

  experience: ['Less than One Year', '1-2 Years', '3-5 Years', '6-9 Years', '10 Years or More'],
});

export const ANSWERS = ['Strongly Agree', 'Agree', 'Disagree', 'Strongly Disagree'];

const questionKeys = QUESTIONS.map((q) => q.key);

const enumField = (values) => Joi.string().valid(...values);

const year = Joi.alternatives().try(
  Joi.string().pattern(/^\d{4}$/),
  Joi.number().integer().min(1900).max(9999),
);

const optionalAll = (values) =>
  Joi.string()
    .valid(...values, '__ALL__', '')
    .allow(null);

const dimensions = {
  age: optionalAll(DEMOGRAPHICS.age),

  job_level: optionalAll(DEMOGRAPHICS.jobLevel),

  department: optionalAll(DEMOGRAPHICS.department),

  experience: optionalAll(DEMOGRAPHICS.experience),

  year: Joi.alternatives().try(year, Joi.string().valid('__ALL__', 'ALL')).allow(null),
};

export const empty = Joi.object({});

export const params = Joi.object({
  headerId: Joi.number().integer().positive().required(),
});

export const submission = Joi.object({
  language: Joi.string().valid('en', 'ar').required(),

  demographics: Joi.object(
    Object.fromEntries(
      Object.entries(DEMOGRAPHICS).map(([key, values]) => [key, enumField(values).required()]),
    ),
  ).required(),

  answers: Joi.object(
    Object.fromEntries(questionKeys.map((key) => [key, enumField(ANSWERS).required()])),
  ).required(),

  remarks: Joi.object()
    .pattern(Joi.string().valid(...questionKeys), Joi.string().max(500).allow(''))
    .default({}),
}).required();

export const listing = Joi.object({
  year: Joi.alternatives().try(year, Joi.string().valid('ALL')),

  age: enumField(DEMOGRAPHICS.age),

  jobLevel: enumField(DEMOGRAPHICS.jobLevel),

  department: enumField(DEMOGRAPHICS.department),

  experience: enumField(DEMOGRAPHICS.experience),

  from: Joi.date().iso().raw(),

  to: Joi.date().iso().raw(),

  q: Joi.string().max(200),

  page: Joi.number().integer().positive().default(1),

  pageSize: Joi.number().integer().min(1).max(200).default(50),
});

export const questionBody = Joi.object({
  question_key: Joi.string()
    .valid(...questionKeys)
    .required(),
});

export const distributionBody = Joi.object({
  question_key: Joi.string()
    .valid(...questionKeys)
    .required(),

  ...dimensions,
});

export const categoryBody = Joi.object({
  category_key: Joi.string()
    .valid(...SECTIONS.map((section) => section[0]))
    .required(),

  ...dimensions,
});

export const yearwiseBody = Joi.object({
  question_key: Joi.string()
    .valid(...questionKeys)
    .required(),

  years: Joi.array().items(year).min(1).unique().required(),
});

export const categoryDepartmentQuery = Joi.object({
  year: Joi.alternatives().try(year, Joi.string().valid('__ALL__')).default('__ALL__'),

  age: optionalAll(DEMOGRAPHICS.age),

  jobLevel: optionalAll(DEMOGRAPHICS.jobLevel),

  department: optionalAll(DEMOGRAPHICS.department),

  experience: optionalAll(DEMOGRAPHICS.experience),
});
