import Anthropic from '@anthropic-ai/sdk';

// Tier cascade — ordered by quality. All are free-tier on OpenRouter.
const TIERS = [
  { id: 1, model: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron-120B' },
  { id: 2, model: 'deepseek/deepseek-v4-flash:free',        label: 'DeepSeek-V4'  },
  { id: 3, model: 'google/gemma-4-31b-it:free',             label: 'Gemma-4-31B'  },
  { id: 4, model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama-3.3-70B'},
  { id: 5, model: 'openrouter/free',                        label: 'OR-Auto'      },
];

// Cache the last-working tier for up to 5 minutes to skip probing on each request.
const CACHE_TTL_MS = 5 * 60 * 1000;
let _preferred = { tierId: 1, expiresAt: 0 };

let _client = null;
function getClient() {
  if (_client) return _client;
  const opts = { apiKey: process.env.ANTHROPIC_API_KEY };
  if (process.env.ANTHROPIC_BASE_URL) opts.baseURL = process.env.ANTHROPIC_BASE_URL;
  _client = new Anthropic(opts);
  return _client;
}

// Returns true when the error is a model availability problem worth retrying on next tier.
// Auth errors (401) and bad-request errors (400) are not retryable — no point cascading.
function isFallbackError(err) {
  const msg = (err?.message ?? String(err)).toLowerCase();
  const status = err?.status ?? err?.statusCode;
  if (status === 401 || status === 400) return false;
  if ([404, 429, 500, 502, 503].includes(status)) return true;
  return (
    msg.includes('overloaded') || msg.includes('quota')   || msg.includes('rate')  ||
    msg.includes('timeout')    || msg.includes('not found')|| msg.includes('529')   ||
    msg.includes('unavailable')
  );
}

function getStartTier() {
  return Date.now() < _preferred.expiresAt ? _preferred.tierId : 1;
}

function setPreferred(tierId) {
  _preferred = { tierId, expiresAt: Date.now() + CACHE_TTL_MS };
}

/**
 * Calls the AI cascade and returns the first successful response.
 * AI_MODEL env var bypasses the cascade (useful for debugging).
 *
 * @param {Array}  messages   — Anthropic messages array
 * @param {string} system     — System prompt
 * @param {number} maxTokens  — Max tokens for this call
 * @returns {{ content: string, model: string, tier: number, latencyMs: number }}
 */
export async function callWithFallback(messages, system, maxTokens = 4096) {
  const client = getClient();

  if (process.env.AI_MODEL) {
    const t0 = Date.now();
    const result = await client.messages.create({
      model: process.env.AI_MODEL, system, messages, max_tokens: maxTokens,
    });
    const content = result.content.find(b => b.type === 'text')?.text ?? '';
    return { content, model: process.env.AI_MODEL, tier: 0, latencyMs: Date.now() - t0 };
  }

  const tiersToTry = TIERS.slice(getStartTier() - 1);
  let lastErr = null;

  for (const tier of tiersToTry) {
    const t0 = Date.now();
    try {
      const result = await client.messages.create({
        model: tier.model, system, messages, max_tokens: maxTokens,
      });
      const content = result.content.find(b => b.type === 'text')?.text ?? '';
      const latencyMs = Date.now() - t0;
      console.log(`[ai/cascade] Tier ${tier.id} (${tier.label}) OK — ${latencyMs}ms`);
      setPreferred(tier.id);
      return { content, model: tier.model, tier: tier.id, latencyMs };
    } catch (err) {
      if (!isFallbackError(err)) throw err;
      console.warn(`[ai/cascade] Tier ${tier.id} (${tier.label}) failed (${err?.status ?? err?.message?.slice(0, 60)}) — next tier`);
      lastErr = err;
    }
  }

  throw lastErr ?? new Error('All AI tiers exhausted');
}

/**
 * Streams AI output with tier cascade fallback.
 * Falls back to the next tier only when failure occurs before the first chunk arrives.
 * Once streaming has started, recovery is impossible — the error propagates.
 *
 * @param {Array}    messages  — Anthropic messages array
 * @param {string}   system    — System prompt
 * @param {number}   maxTokens
 * @param {Function} onText    — Called with each streamed text chunk
 * @returns {{ model: string, tier: number }}
 */
export async function streamWithFallback(messages, system, maxTokens, onText) {
  const client = getClient();
  const tiersToTry = process.env.AI_MODEL
    ? [{ id: 0, model: process.env.AI_MODEL, label: 'override' }]
    : TIERS.slice(getStartTier() - 1);

  let lastErr = null;

  for (const tier of tiersToTry) {
    let chunksReceived = 0;
    try {
      const stream = client.messages.stream({
        model: tier.model, system, messages, max_tokens: maxTokens,
      });
      stream.on('text', text => { chunksReceived++; onText(text); });
      await stream.finalMessage();
      console.log(`[ai/cascade/stream] Tier ${tier.id} (${tier.label}) OK`);
      if (tier.id !== 0) setPreferred(tier.id);
      return { model: tier.model, tier: tier.id };
    } catch (err) {
      if (chunksReceived > 0) throw err; // mid-stream: unrecoverable
      if (!isFallbackError(err)) throw err;
      console.warn(`[ai/cascade/stream] Tier ${tier.id} (${tier.label}) failed before first chunk — next tier`);
      lastErr = err;
    }
  }

  throw lastErr ?? new Error('All AI tiers exhausted');
}
