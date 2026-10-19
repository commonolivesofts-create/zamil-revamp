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
