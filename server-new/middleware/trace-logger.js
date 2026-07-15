import { v4 as uuid } from "uuid";

export function traceLogger(req, res, next) {
  const executionId = uuid();
  req.executionId = executionId;
  req._startTime = Date.now();

  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const duration = Date.now() - req._startTime;
    const logEntry = {
      execution_id: executionId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };
    if (process.env.NODE_ENV !== "production") {
      console.log(`[TRACE] ${executionId} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    }
    if (body && typeof body === "object") {
      body._trace = { execution_id: executionId, duration_ms: duration };
    }
    return originalJson(body);
  };

  next();
}
