// dotenv/config MUST be the first import in ESM — module bodies run after all
// imports are evaluated, so dotenv.config() in the body would be too late.
import 'dotenv/config';

import express from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ── Security infrastructure ───────────────────────────────────────────────────
import { validateEnv }    from './config/env.js';
import { buildCorsOptions } from './config/corsOptions.js';
import { requestId }      from './middleware/requestId.js';
import { requestLogger }  from './middleware/requestLogger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { errorHandler }   from './middleware/errorHandler.js';

// ── Route modules ─────────────────────────────────────────────────────────────
import healthRouter    from './routes/health.js';
import assetsRouter    from './routes/assets.js';
import aiRouter        from './routes/ai.js';
import climateRouter   from './routes/climate.js';
import documentosRouter from './routes/documentos.js';
import searchRouter    from './routes/search.js';
import alertsRouter    from './routes/alerts.js';
import ensoRouter      from './routes/enso.js';
import terrainRouter   from './routes/terrain.js';
import nasaRouter      from './routes/nasa.js';
import nasaMetricsRouter from './routes/nasaMetrics.js';
import { mountV2 }     from './climate-v2.js';

// Fail fast if required env vars are absent.
validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app = express();

// ── Global middleware (order matters) ─────────────────────────────────────────

// 1. Request ID — must be first so reqId is available in all downstream middleware
app.use(requestId);

// 2. Security headers
app.use(helmet({
  // Content-Security-Policy is relaxed because the frontend is a SPA served from
  // the same origin — a strict CSP would block inline React scripts.
  contentSecurityPolicy: false,
}));

// 3. CORS — allowlist from ALLOWED_ORIGINS env var
app.use(cors(buildCorsOptions()));

// 4. Compression
app.use(compression());

// 5. Body parsers — 10 MB for JSON (was 50 MB; bulk climate uploads use multipart)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 6. Structured request logging
app.use(requestLogger);

// 7. Global rate limiter (generous — per-endpoint limiters are stricter)
app.set('trust proxy', 1);
app.use('/api/', generalLimiter);

// ── Static files (Vite build) ─────────────────────────────────────────────────
app.use(express.static('dist'));

// ── Health probes (no auth, no rate limit) ────────────────────────────────────
app.use(healthRouter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/assets',     assetsRouter);
app.use('/api/alerts',     alertsRouter);
app.use('/api/ai',         aiRouter);
app.use('/api/documentos', documentosRouter);
app.use('/api',            searchRouter);   // /api/test, /api/search, /api/places/assets
app.use('/api',            climateRouter);  // /api/climate, /api/climate-cells/*, /api/climate-risks/*, etc.
app.use('/api',            ensoRouter);     // /api/enso/status, /api/enso/refresh, /api/enso/cache-stats
  app.use('/api',            terrainRouter);  // /api/terrain/slope, /api/terrain/cache-stats, /api/terrain/cache
  app.use('/api',            nasaRouter);     // /api/nasa-power/health
app.use('/api',            nasaMetricsRouter); // /api/nasa-metrics

// ── Pipeline v2 routes (mismo proceso, mismo puerto) ──────────────────────────
mountV2(app);

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    const file = req.path.startsWith('/v2') ? 'v2.html' : 'index.html';
    res.sendFile(join(__dirname, '..', 'dist', file));
  } else {
    res.status(404).json({ error: 'API endpoint no encontrado', reqId: req.id });
  }
});

// ── Centralized error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(JSON.stringify({
    ts:      new Date().toISOString(),
    level:   'INFO',
    message: `Servidor corriendo en http://localhost:${PORT}`,
    nodeEnv: process.env.NODE_ENV,
  }));
});
