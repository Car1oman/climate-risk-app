import rateLimit from 'express-rate-limit';

const rateLimitJson = (req, res) => {
  res.status(429).json({
    error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
    code: 'RATE_LIMITED',
    reqId: req.id,
    retryAfter: '60s',
  });
};

/** General API: 200 requests / 60 s per IP. */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJson,
});

/** Mutable endpoints (uploads, deletes, cache flush): 30 req / 60 s per IP. */
export const strictLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJson,
});

/** AI report generation: 10 req / 60 s per IP — Gemini quota protection. */
export const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJson,
});
