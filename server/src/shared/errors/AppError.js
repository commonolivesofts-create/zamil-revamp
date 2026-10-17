/**
 * An expected, client-safe failure. `code` is a stable identifier for frontend
 * branching and `message` must be safe to display to users.
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details, options) {
    super(message, options);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
