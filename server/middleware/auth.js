import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { Errors } from '../errors/AppError.js';

/** Lazy Supabase client used only for auth.getUser() token verification. */
let _authClient = null;
function getAuthClient() {
  if (!_authClient) {
    _authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  }
  return _authClient;
}

/**
 * requireAuth — protects mutable endpoints.
 *
 * DEV mode (DEV_AUTH_BYPASS=true, non-production):
 *   Injects a synthetic user for backend integration testing (e.g., curl/Postman).
 *   Never active in NODE_ENV=production regardless of the env var.
 *
 * Production mode:
 *   Expects: Authorization: Bearer <supabase-jwt>
 *   Verifies the JWT via supabase.auth.getUser() and attaches req.user.
 */
export async function requireAuth(req, res, next) {
  if (config.devAuthBypass) {
    req.user = { id: 'user-1', name: 'Usuario Demo', role: 'admin', _bypass: true };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(Errors.unauthorized('Token de autenticación requerido'));
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await getAuthClient().auth.getUser(token);
    if (error || !user) {
      return next(Errors.unauthorized('Token inválido o expirado'));
    }
    req.user = { id: user.id, email: user.email, role: user.role || 'authenticated' };
    next();
  } catch {
    next(Errors.unauthorized('Error al validar el token'));
  }
}

/**
 * optionalAuth — attaches user if a valid token is present, never blocks.
 * Use on read endpoints to log who is querying.
 */
export async function optionalAuth(req, res, next) {
  if (config.devAuthBypass) {
    req.user = { id: 'user-1', name: 'Usuario Demo', role: 'admin', _bypass: true };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const { data: { user } } = await getAuthClient().auth.getUser(authHeader.slice(7));
    if (user) req.user = { id: user.id, email: user.email, role: user.role || 'authenticated' };
  } catch {
    // non-fatal
  }
  next();
}
