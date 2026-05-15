import { config } from './env.js';

/**
 * Returns a cors() options object that restricts origins to ALLOWED_ORIGINS env var.
 * Requests with no origin (curl, mobile apps, server-to-server) are allowed through.
 */
export function buildCorsOptions() {
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin not allowed — ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  };
}
