import { AppError } from '../shared/errors/AppError.js';
import { sendError } from '../shared/responses/apiResponse.js';

// Client errors raised by Express's body parser, identified by their `type`.
const BODY_PARSER_ERRORS = {
  'entity.parse.failed': [400, 'MALFORMED_REQUEST', 'Request body is not valid JSON'],
  'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the allowed size'],
  'encoding.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', 'Request encoding is not supported'],
  'charset.unsupported': [415, 'UNSUPPORTED_MEDIA_TYPE', 'Request charset is not supported'],
};

function toAppError(err) {
  if (err instanceof AppError) return err;

  const bodyParserError = BODY_PARSER_ERRORS[err.type];
  if (bodyParserError) return new AppError(...bodyParserError);

  // Other client errors raised by Express/http-errors (e.g. an undecodable route
  // parameter). Their messages can echo request input, so a generic message is used.
  const status = err.status ?? err.statusCode;
  if (status >= 400 && status < 500) {
    return new AppError(status, 'BAD_REQUEST', 'The request could not be processed');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found'));
}

export function errorHandler(err, _req, res, next) {
  if (res.headersSent) return next(err);

  const appError = toAppError(err);

  // Server-side failures are attached for pino-http to log once with the request
  // context; internal details are never sent to the client.
  if (appError.statusCode >= 500) res.err = err;

  sendError(res, appError.statusCode, appError);
}
