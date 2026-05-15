import { AppError } from '../errors/AppError.js';
import { config } from '../config/env.js';

/**
 * Centralized error handler — MUST be the last middleware registered in server.js.
 * Returns a consistent JSON envelope: { error, code, reqId, [details] }
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Operational errors (AppError)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code:  err.code,
      reqId: req.id,
    });
  }

  // CORS origin rejection
  if (err.message?.includes('CORS: Origin not allowed')) {
    return res.status(403).json({
      error: 'Origin no permitido por la política CORS',
      code:  'CORS_BLOCKED',
      reqId: req.id,
    });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error:   'Datos de entrada inválidos',
      code:    'VALIDATION_ERROR',
      reqId:   req.id,
      details: err.errors?.map(e => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'El archivo supera el tamaño máximo permitido',
      code:  'FILE_TOO_LARGE',
      reqId: req.id,
    });
  }

  // Unknown / programming errors — log server-side, hide details in production
  console.error(JSON.stringify({
    ts:     new Date().toISOString(),
    level:  'ERROR',
    reqId:  req.id,
    method: req.method,
    path:   req.path,
    message: err.message,
    stack:  err.stack,
  }));

  res.status(500).json({
    error: config.isProduction ? 'Error interno del servidor' : err.message,
    code:  'INTERNAL_ERROR',
    reqId: req.id,
    ...(config.isProduction ? {} : { stack: err.stack }),
  });
}
