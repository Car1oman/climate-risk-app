/**
 * Operational error with HTTP status code and machine-readable code.
 * Use Errors.* factory helpers instead of constructing directly.
 */
export class AppError extends Error {
  /** @param {string} message @param {number} statusCode @param {string} code */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

export const Errors = {
  badRequest:   (msg)               => new AppError(msg, 400, 'BAD_REQUEST'),
  unauthorized: (msg = 'No autorizado') => new AppError(msg, 401, 'UNAUTHORIZED'),
  forbidden:    (msg = 'Acceso denegado') => new AppError(msg, 403, 'FORBIDDEN'),
  notFound:     (msg = 'Recurso no encontrado') => new AppError(msg, 404, 'NOT_FOUND'),
  conflict:     (msg)               => new AppError(msg, 409, 'CONFLICT'),
  unprocessable:(msg)               => new AppError(msg, 422, 'UNPROCESSABLE'),
  internal:     (msg = 'Error interno del servidor') => new AppError(msg, 500, 'INTERNAL_ERROR'),
};
