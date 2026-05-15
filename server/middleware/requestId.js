import { randomUUID } from 'crypto';

/**
 * Attaches a UUID to req.id and echoes it in the X-Request-ID response header.
 * Respects an incoming X-Request-ID from upstream proxies (Render, Vercel, etc.).
 */
export function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}
