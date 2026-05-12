// Shared in-memory cache for all route modules.
// Single object so climate and documentos routes share the same TTL entries.
export const climateCache = {};
export const CACHE_TTL = 1000 * 60 * 10; // 10 minutos
