/**
 * Structured Logger
 *
 * Provides a consistent structured logging interface across all services.
 * Each log entry includes: level, timestamp, service, message, and optional metadata.
 *
 * Constitution VII (Observability): every external call, cache hit/miss,
 * and failure is logged with structured context.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function formatLog(level, service, message, meta = {}) {
  return {
    level,
    timestamp: new Date().toISOString(),
    service,
    message,
    ...meta,
  };
}

function write(entry) {
  const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.service}] ${entry.message}`;
  if (entry.level === 'error') {
    console.error(line, entry);
  } else if (entry.level === 'warn') {
    console.warn(line, entry);
  } else {
    console.log(line, entry);
  }
}

export const logger = {
  error(service, message, meta) { write(formatLog('error', service, message, meta)); },
  warn(service, message, meta)  { write(formatLog('warn', service, message, meta)); },
  info(service, message, meta)  { write(formatLog('info', service, message, meta)); },
  debug(service, message, meta) { write(formatLog('debug', service, message, meta)); },
};
