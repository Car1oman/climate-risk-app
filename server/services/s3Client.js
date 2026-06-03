/**
 * Reusable S3-compatible client configured for Cloudflare R2.
 * Import { s3Client, R2_BUCKET, buildPublicUrl } wherever R2 operations are needed.
 *
 * Prerequisites: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 * and R2_PUBLIC_URL must be set in the environment (see .env.example).
 */

import { S3Client } from '@aws-sdk/client-s3';
import { config } from '../config/env.js';

// Lazily instantiated so the module can be imported even when R2 vars are absent
// (e.g. during Supabase-only operation).  Call getS3Client() instead of using
// s3Client directly to get a clear error when the configuration is incomplete.
let _client = null;

function getS3Client() {
  if (!config.r2Configured) {
    throw new Error(
      'Cloudflare R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, ' +
      'R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_URL in the environment.'
    );
  }

  if (!_client) {
    _client = new S3Client({
      region: 'auto',          // R2 requires "auto"
      endpoint: config.r2Endpoint,
      credentials: {
        accessKeyId:     config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      },
    });
  }

  return _client;
}

/** Pre-configured S3Client instance (lazy — throws if R2 vars missing). */
export const s3Client = new Proxy({}, {
  get(_target, prop) {
    return getS3Client()[prop];
  },
});

/** Target bucket name read from R2_BUCKET. */
export const R2_BUCKET = config.r2Bucket;

/**
 * Build the public URL for a stored object.
 * @param {string} key  Object key as stored in R2 (e.g. "docs/uuid/file.pdf")
 * @returns {string}    Full public URL
 */
export function buildPublicUrl(key) {
  if (!key) throw new TypeError('buildPublicUrl: key is required');
  const base = config.r2PublicUrl;
  if (!base) throw new Error('R2_PUBLIC_URL is not configured');
  return `${base}/${key}`;
}
