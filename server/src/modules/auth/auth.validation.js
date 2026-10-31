import Joi from 'joi';
import { LOGIN_PASSWORD_MAX_LENGTH, USERNAME_MAX_LENGTH } from './auth.policy.js';

// Control characters are never part of a valid username.
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;

export const loginSchema = Joi.object({
  username: Joi.string()
    .trim()
    .min(1)
    .max(USERNAME_MAX_LENGTH)
    .pattern(NO_CONTROL_CHARACTERS)
    .required(),
  // Not trimmed or policy-checked: the submitted value is verified exactly as typed.
  password: Joi.string().min(1).max(LOGIN_PASSWORD_MAX_LENGTH).required(),
});

// Endpoints that take no input still reject unexpected query parameters.
export const emptyQuerySchema = Joi.object({});

// Optional image revision used by the browser to fetch a newly uploaded avatar.
export const profileImageQuerySchema = Joi.object({
  v: Joi.string().pattern(/^(?:[1-9][0-9]{0,18}|[0-9]{13})$/),
});

// Endpoints that take no body still reject unexpected fields.
export const emptyBodySchema = Joi.object({});

// A six-digit code from the authenticator app; nothing else is accepted.
export const mfaCodeSchema = Joi.object({
  code: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'code must be the 6-digit code from your authenticator app',
    }),
});

// Account action tokens are 256-bit base64url values (43 characters), carried in the body only.
const actionToken = Joi.string()
  .pattern(/^[A-Za-z0-9_-]{43}$/)
  .required()
  .messages({ 'string.pattern.base': 'token is not valid' });
// Policy compliance is checked by the service (rule-by-rule result); Joi only bounds the size.
const newPassword = Joi.string().min(1).max(LOGIN_PASSWORD_MAX_LENGTH).required();
const currentPassword = Joi.string().min(1).max(LOGIN_PASSWORD_MAX_LENGTH).required();
const sixDigitCode = Joi.string()
  .pattern(/^\d{6}$/)
  .required()
  .messages({ 'string.pattern.base': 'code must be the 6-digit code from your authenticator app' });

export const recoveryRequestSchema = Joi.object({
  username: loginSchema.extract('username'),
  purpose: Joi.string().valid('PASSWORD_RESET', 'MFA_RECOVERY').required(),
});
export const passwordTokenSchema = Joi.object({ token: actionToken, newPassword });
export const passwordChangeSchema = Joi.object({ currentPassword, newPassword });
export const mfaRecoveryStartSchema = Joi.object({ token: actionToken, password: currentPassword });
export const mfaRecoveryConfirmSchema = Joi.object({
  token: actionToken,
  password: currentPassword,
  code: sixDigitCode,
});
