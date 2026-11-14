import Joi from 'joi';
import { sourceDraftSchema } from './mapping/sourceContract.js';

/*
 * Workflow Manager M2-A request schemas (source version mapping). NUMBER(19,0) identifiers travel
 * as decimal strings; ROW_VERSION is the optimistic lock. The draft body is the M2-0 author schema
 * `sourceDraftSchema` itself (columns[{ name, exposed, dataClass }], keyCandidates[{ code, columns,
 * assurance }]), so the HTTP allowlist and the canonical contract can never diverge. Unknown
 * properties — lifecycle, default, publication, fingerprint, audit or source identity fields — are
 * rejected with 400: everything factual is derived on the server.
 */
const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const rowVersion = Joi.number().integer().min(1).max(9999999999).required();

export const sourceVersionParams = Joi.object({
  sourceId: id.required(),
  versionId: id.required(),
});

export const sourceVersionListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
});

export const sourceVersionCreateBodySchema = Joi.object({
  draft: sourceDraftSchema.required(),
});

export const sourceVersionUpdateBodySchema = Joi.object({
  rowVersion,
  draft: sourceDraftSchema.required(),
});

export const sourceVersionRowVersionBodySchema = Joi.object({ rowVersion });
