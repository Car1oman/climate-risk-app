/**
 * Structured JSON request logging.
 * Emits one log line per request on response finish (includes status + duration).
 * Skips /healthz and /readyz to avoid log spam from uptime monitors.
 */
export function requestLogger(req, res, next) {
  if (req.path === '/healthz' || req.path === '/readyz') return next();

  const start = Date.now();

  res.on('finish', () => {
    console.log(JSON.stringify({
      ts:     new Date().toISOString(),
      level:  res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
      reqId:  req.id,
      method: req.method,
      path:   req.path,
      status: res.statusCode,
      ms:     Date.now() - start,
      ip:     req.ip,
    }));
  });

  next();
}
