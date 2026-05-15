/**
 * Server-side JSDoc typedefs.
 * Import in server files with: @typedef {import('./types').Asset} Asset
 */

/**
 * @typedef {Object} AssetLocation
 * @property {number} lat
 * @property {number} lng
 * @property {string} [address]
 * @property {string} [city]
 * @property {string} [country]
 * @property {string} [region]
 */

/**
 * @typedef {Object} Asset
 * @property {string} id
 * @property {string} name
 * @property {string} [type]
 * @property {AssetLocation} location
 * @property {number} [value]
 * @property {string} [currency]
 * @property {number} [area]
 * @property {string} [owner]
 * @property {Record<string, unknown>} [metadata]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} ClimateRisk
 * @property {string} assetId
 * @property {string} hazardType
 * @property {number} hazard
 * @property {number} exposure
 * @property {number} impact
 * @property {number} riskScore
 * @property {'low'|'medium'|'high'|'critical'} severity
 * @property {number} [confidence]
 * @property {'2030'|'2050'|'2100'} [horizon]
 * @property {'rcp26'|'rcp45'|'rcp85'} [scenario]
 * @property {string} [narrative]
 * @property {string[]} [adaptations]
 * @property {string} [computedAt]
 */

/**
 * @typedef {Object} Alert
 * @property {string} id
 * @property {string} type
 * @property {'info'|'warning'|'error'|'critical'} severity
 * @property {string} title
 * @property {string} message
 * @property {string} [assetId]
 * @property {string} [riskType]
 * @property {string} timestamp
 * @property {boolean} [acknowledged]
 * @property {string} [source]
 */

/**
 * @typedef {Object} Document
 * @property {string} id
 * @property {string} title
 * @property {string} type
 * @property {string} [url]
 * @property {string} [content]
 * @property {string} [summary]
 * @property {string} uploadedAt
 * @property {string} [source]
 * @property {string[]} [tags]
 * @property {string[]} [assetIds]
 */

/**
 * @template T
 * @typedef {Object} APIResponse
 * @property {boolean} success
 * @property {T} [data]
 * @property {string} [error]
 * @property {string} [message]
 * @property {string} [timestamp]
 * @property {string} [requestId]
 */

/**
 * @template T
 * @typedef {APIResponse<T[]> & { total?: number; page?: number; pageSize?: number }} PaginatedResponse
 */
