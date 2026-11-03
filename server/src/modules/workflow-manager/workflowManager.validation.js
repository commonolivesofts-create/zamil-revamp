import Joi from 'joi';
import { SOURCE_KINDS } from './workflowManager.catalog.js';

/*
 * Workflow Manager M1 request schemas. Lengths follow the deployed Oracle dictionary of
 * XX_ZRV_WF_FORMS / XX_ZRV_WF_DATA_SOURCES (TEST, 2026-11-02). NUMBER(19,0) identifiers travel as
 * decimal strings; ROW_VERSION (NUMBER(10,0)) is an integer used for optimistic locking.
 */
const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;
const requiredText = (max) =>
  Joi.string().trim().min(1).max(max).pattern(NO_CONTROL_CHARACTERS).required();
// Optional text: absent, null or empty all mean "not set".
const optionalText = (max) =>
  Joi.string()
    .trim()
    .max(max)
    .pattern(NO_CONTROL_CHARACTERS)
    .allow('', null)
    .empty('')
    .default(null);

// Stable machine codes: upper-case letters, digits and underscores, starting with a letter.
const CODE = /^[A-Z][A-Z0-9_]*$/;
const code = (max) => Joi.string().trim().max(max).pattern(CODE);
// Oracle identifiers in the dictionary's stored (upper-case, unquoted) form.
const ORACLE_IDENTIFIER = /^[A-Z][A-Z0-9_$#]*$/;
const identifier = Joi.string().trim().uppercase().max(128).pattern(ORACLE_IDENTIFIER);
// An application route of the React frontend, such as /hr/employee-services/sick-leave/:leaveId
// (same shape the client registry accepts). Never a URL with a scheme or host.
const SEGMENT = '(?::[A-Za-z][A-Za-z0-9]*|[a-z0-9][a-z0-9-]*)';
const DETAIL_ROUTE = new RegExp(`^/${SEGMENT}(?:/${SEGMENT})*$`);

const rowVersion = Joi.number().integer().min(1).max(9999999999).required();
const page = Joi.number().integer().min(1).max(100000).default(1);
const pageSize = Joi.number().integer().min(1).max(100).default(20);
const search = Joi.string().trim().max(100).pattern(NO_CONTROL_CHARACTERS).allow('').optional();
const status = Joi.string().valid('ACTIVE', 'INACTIVE').optional();
const sortDir = Joi.string().valid('asc', 'desc').default('asc');

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});

export const formIdParams = Joi.object({ formId: id.required() });
export const sourceIdParams = Joi.object({ sourceId: id.required() });

export const rowVersionBodySchema = Joi.object({ rowVersion });

// --- Forms (XX_ZRV_WF_FORMS) ---------------------------------------------------------------------

export const formListQuerySchema = Joi.object({
  page,
  pageSize,
  search,
  moduleCode: code(80).optional(),
  status,
  sortBy: Joi.string()
    .valid('FORM_CODE', 'FORM_NAME', 'MODULE_CODE', 'UPDATED_AT')
    .default('FORM_CODE'),
  sortDir,
});

const formFields = {
  formName: requiredText(200),
  moduleCode: code(80).required(),
  detailRoute: Joi.string()
    .trim()
    .max(500)
    .pattern(DETAIL_ROUTE)
    .allow('', null)
    .empty('')
    .default(null),
  description: optionalText(1000),
};

/** Registration: FORM_CODE is chosen once and never changes afterwards (stable identity). */
export const formCreateBodySchema = Joi.object({
  formCode: code(80).required(),
  ...formFields,
});

export const formUpdateBodySchema = Joi.object({ ...formFields, rowVersion });

// --- Data sources (XX_ZRV_WF_DATA_SOURCES) -------------------------------------------------------

export const sourceListQuerySchema = Joi.object({
  page,
  pageSize,
  search,
  sourceKind: Joi.string()
    .valid(...SOURCE_KINDS)
    .optional(),
  status,
  sortBy: Joi.string()
    .valid('SOURCE_CODE', 'SOURCE_NAME', 'SOURCE_KIND', 'UPDATED_AT')
    .default('SOURCE_CODE'),
  sortDir,
});

/*
 * Source identity mirrors CHECK ZWF_CK_SRC_3: TABLE/VIEW need owner + object and no handler;
 * HANDLER needs a handler code and no owner/object.
 */
const sourceIdentity = {
  sourceName: requiredText(200),
  sourceKind: Joi.string()
    .valid(...SOURCE_KINDS)
    .required(),
  ownerName: Joi.when('sourceKind', {
    is: 'HANDLER',
    then: Joi.valid(null).default(null),
    otherwise: identifier.required(),
  }),
  objectName: Joi.when('sourceKind', {
    is: 'HANDLER',
    then: Joi.valid(null).default(null),
    otherwise: identifier.required(),
  }),
  handlerCode: Joi.when('sourceKind', {
    is: 'HANDLER',
    then: code(128).required(),
    otherwise: Joi.valid(null).default(null),
  }),
};

export const sourceCreateBodySchema = Joi.object({
  sourceCode: code(80).required(),
  ...sourceIdentity,
});

export const sourceUpdateBodySchema = Joi.object({ ...sourceIdentity, rowVersion });

// --- Lookups -------------------------------------------------------------------------------------

export const sourceObjectsQuerySchema = Joi.object({
  objectType: Joi.string().valid('TABLE', 'VIEW').required(),
  search: Joi.string()
    .trim()
    .uppercase()
    .max(128)
    .pattern(/^[A-Z0-9_$#]*$/)
    .allow('')
    .optional(),
});
