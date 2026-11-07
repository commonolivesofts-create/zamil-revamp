import Joi from 'joi';

/** Oracle HR text columns use BYTE semantics, including the Arabic columns. */
export function dbText(maxBytes, { required = false, multiline = false, nullable = false } = {}) {
  let schema = Joi.string()
    .trim()
    .custom((value, helpers) => {
      const controls = multiline ? value.replace(/\r\n?/gu, '\n').replace(/\n/gu, '') : value;
      if (/[\p{Cc}]/u.test(controls)) return helpers.error('text.controls');
      const normalized = multiline
        ? value.replace(/\r\n?/gu, '\n').trim()
        : value.replace(/\s+/gu, ' ').trim();
      if (Buffer.byteLength(normalized, 'utf8') > maxBytes) {
        return helpers.error('text.bytes', { limit: maxBytes });
      }
      return normalized;
    })
    .messages({
      'text.controls': '{{#label}} contains an unsupported control character',
      'text.bytes': '{{#label}} is too long; shorten it to fit the {{#limit}}-byte limit',
    });
  if (required) schema = schema.min(1).required();
  else schema = schema.allow('').optional();
  if (nullable) schema = schema.allow(null);
  return schema;
}
