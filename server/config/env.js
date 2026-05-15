/**
 * Boot-time environment validation.
 * Call validateEnv() once before the server starts — process.exit(1) on missing required vars.
 */

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_KEY'];

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

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'INFO',
    message: 'Environment validated',
    nodeEnv: process.env.NODE_ENV,
    devAuthBypass: process.env.DEV_AUTH_BYPASS === 'true',
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
};
