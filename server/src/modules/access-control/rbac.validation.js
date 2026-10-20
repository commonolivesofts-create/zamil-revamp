import Joi from 'joi';

// Codes follow the locked CHECK constraints (^[A-Z][A-Z0-9_]*$, trimmed); lengths follow the columns.
const code = (max) =>
  Joi.string()
    .max(max)
    .pattern(/^[A-Z][A-Z0-9_]*$/)
    .messages({
      'string.pattern.base': '{{#label}} must be upper-case letters, digits and underscores',
    });
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;
const name = Joi.string().trim().min(1).max(120).pattern(NO_CONTROL_CHARACTERS);
const description = Joi.string().trim().min(1).max(500).allow(null);
// NUMBER(19,0) identifiers travel as decimal strings; never as JS numbers.
const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const futureTimestamp = Joi.date()
  .iso()
  .greater('now')
  .allow(null)
  .messages({ 'date.greater': '{{#label}} must be in the future' });

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});

export const pageQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
});

export const roleIdParams = Joi.object({ roleId: id.required() });
export const userIdParams = Joi.object({ userId: id.required() });
export const moduleIdParams = Joi.object({ moduleId: id.required() });
export const resourceIdParams = Joi.object({ resourceId: id.required() });
export const permissionIdParams = Joi.object({ permissionId: id.required() });
export const rolePermissionParams = Joi.object({
  roleId: id.required(),
  permissionId: id.required(),
});
export const userRoleParams = Joi.object({ userId: id.required(), roleId: id.required() });
export const userPermissionParams = Joi.object({
  userId: id.required(),
  permissionId: id.required(),
});

export const createRoleSchema = Joi.object({
  roleCode: code(60).required(),
  roleName: name.required(),
  description,
});

export const updateRoleSchema = Joi.object({ roleName: name, description }).min(1);

export const createModuleSchema = Joi.object({
  moduleCode: code(60).required(),
  moduleName: name.required(),
  description,
  displayOrder: Joi.number().integer().min(0).max(99999),
});

export const createResourceSchema = Joi.object({
  resourceCode: code(80).required(),
  resourceName: name.required(),
  description,
});

export const createPermissionSchema = Joi.object({
  actionCode: code(40).required(),
  description,
});

export const activationSchema = Joi.object({ isActive: Joi.boolean().strict().required() });

export const assignRoleSchema = Joi.object({ expiresAt: futureTimestamp });

export const overrideSchema = Joi.object({
  effect: Joi.string().valid('ALLOW', 'DENY').required(),
  justification: Joi.string().trim().min(1).max(500).pattern(NO_CONTROL_CHARACTERS).required(),
  expiresAt: futureTimestamp,
});
