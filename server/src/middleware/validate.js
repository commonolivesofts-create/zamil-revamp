import { AppError } from '../shared/errors/AppError.js';

const PATTERN_MESSAGE = '{{#label}} has an invalid format';

const VALIDATION_OPTIONS = {
  abortEarly: false,
  convert: true,
  errors: { wrap: { label: false } },
  // Joi's default pattern messages echo the rejected value; input is never reflected back.
  messages: {
    'string.pattern.base': PATTERN_MESSAGE,
    'string.pattern.name': PATTERN_MESSAGE,
    'string.pattern.invert.base': PATTERN_MESSAGE,
    'string.pattern.invert.name': PATTERN_MESSAGE,
  },
};

/**
 * Validates request parts against feature-owned Joi schemas. Unknown properties are
 * rejected (Joi's default); on success the converted values replace the originals.
 *
 * @param {{ params?: import('joi').Schema, query?: import('joi').Schema, body?: import('joi').Schema }} schemas
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const details = [];

    for (const [part, schema] of Object.entries(schemas)) {
      const { value, error } = schema.validate(req[part] ?? {}, VALIDATION_OPTIONS);

      if (error) {
        details.push(
          ...error.details.map((detail) => ({
            field: detail.path.join('.') || part,
            message: detail.message,
          })),
        );
        continue;
      }

      // Express 5 exposes req.query through a getter, so the property is redefined.
      Object.defineProperty(req, part, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    if (details.length > 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
    }
    next();
  };
}
