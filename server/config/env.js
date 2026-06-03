/**
 * Boot-time environment validation.
 * Call validateEnv() once before the server starts — process.exit(1) on missing required vars.
 */

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_KEY'];

// R2 vars are optional during migration — validated only when present
const R2_VARS = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];

const DEFAULTS = {
  NODE_ENV: 'development',
  PORT: '3001',
  DEV_AUTH_BYPASS: 'false',
  ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:3001',
};

export function validateEnv() {
  const missing = REQUIRED.filter(v => !process.env[v]?.trim());

  if (missing.length > 0) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'FATAL',
      message: 'Missing required environment variables',
      missing,
    }));
    process.exit(1);
  }

  for (const [key, def] of Object.entries(DEFAULTS)) {
    if (!process.env[key]) process.env[key] = def;
  }

  const r2Configured = R2_VARS.every(v => process.env[v]?.trim());
  const r2Partial    = !r2Configured && R2_VARS.some(v => process.env[v]?.trim());

  if (r2Partial) {
    const missing = R2_VARS.filter(v => !process.env[v]?.trim());
    console.warn(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'WARN',
      message: 'Partial R2 configuration — storage will fall back to Supabase',
      missingR2: missing,
    }));
  }

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'INFO',
    message: 'Environment validated',
    nodeEnv: process.env.NODE_ENV,
    devAuthBypass: process.env.DEV_AUTH_BYPASS === 'true',
    r2Configured,
  }));
}

/** Typed accessors — use these instead of raw process.env throughout server code. */
export const config = {
  get nodeEnv()       { return process.env.NODE_ENV; },
  get port()          { return parseInt(process.env.PORT || '3001', 10); },
  get isProduction()  { return process.env.NODE_ENV === 'production'; },
  get isDevelopment() { return process.env.NODE_ENV !== 'production'; },

  /**
   * DEV_AUTH_BYPASS: when true AND not in production, skip JWT verification and
   * inject a synthetic demo user (matches the current frontend AuthContext stub).
   * Never active in production regardless of the env var value.
   */
  get devAuthBypass() {
    return process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
  },

  get allowedOrigins() {
    return (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  },

  // ── Cloudflare R2 (optional during Supabase Storage → R2 migration) ──────────
  get r2Endpoint()         { return process.env.R2_ENDPOINT || ''; },
  get r2AccessKeyId()      { return process.env.R2_ACCESS_KEY_ID || ''; },
  get r2SecretAccessKey()  { return process.env.R2_SECRET_ACCESS_KEY || ''; },
  get r2Bucket()           { return process.env.R2_BUCKET || ''; },
  get r2PublicUrl()        { return (process.env.R2_PUBLIC_URL || '').replace(/\/$/, ''); },
  get r2Configured()       { return R2_VARS.every(v => process.env[v]?.trim()); },
};
