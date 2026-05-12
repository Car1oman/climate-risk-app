import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import assetsRouter    from './routes/assets.js';
import aiRouter        from './routes/ai.js';
import climateRouter   from './routes/climate.js';
import documentosRouter from './routes/documentos.js';
import searchRouter    from './routes/search.js';
import alertsRouter    from './routes/alerts.js';
import ensoRouter      from './routes/enso.js';     // Sprint 5

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir archivos estáticos (build de Vite)
app.use(express.static('dist'));

// ── Route modules ─────────────────────────────────────────────────────────────
app.use('/api/assets',     assetsRouter);
app.use('/api/alerts',     alertsRouter);
app.use('/api/ai',         aiRouter);
app.use('/api/documentos', documentosRouter);
app.use('/api',            searchRouter);   // /api/test, /api/search, /api/places/assets
app.use('/api',            climateRouter);  // /api/climate, /api/climate-cells/*, /api/climate-risks/*, etc.
app.use('/api',            ensoRouter);     // Sprint 5: /api/enso/status, /api/enso/refresh, /api/enso/cache-stats

const PORT = process.env.PORT || 3001;

// Fallback para SPA: servir index.html para rutas no encontradas
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile('../dist/index.html', { root: __dirname });
  } else {
    res.status(404).json({ error: 'API endpoint no encontrado' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
