/**
 * Minimal in-memory sliding-window rate limiter for the chat endpoint.
 *
 * State lives in the function instance, so on Netlify it is per warm
 * Lambda container rather than global: a determined client spread across
 * cold starts can exceed the nominal limit. That is acceptable here; the
 * goal is to stop a single tab or a naive script from hammering a paid
 * LLM endpoint, not to be a billing-grade quota. The daily generation cap
 * in chat-handler.js is the second line of defence, and a hard spend
 * limit on the API key is the real one.
 */

'use strict';

const MAX_TRACKED_KEYS = 5000;

/**
 * @param {{ limit: number, windowMs: number, now?: () => number }} options
 * @returns {{ check(key: string): { allowed: boolean, retryAfterSec: number, remaining: number }, reset(): void }}
 */
function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map(); // key -> ascending timestamps inside the window

  function prune(timestamps, cutoff) {
    let i = 0;
    while (i < timestamps.length && timestamps[i] <= cutoff) i++;
    return i ? timestamps.slice(i) : timestamps;
  }

  // Bound memory on a long-lived container: when the table is full, drop
  // every key whose window has fully expired, then the oldest if needed.
  function evict(cutoff) {
    for (const [key, timestamps] of hits) {
      if (timestamps[timestamps.length - 1] <= cutoff) hits.delete(key);
    }
    while (hits.size >= MAX_TRACKED_KEYS) {
      hits.delete(hits.keys().next().value);
    }
  }

  return {
    check(key) {
      const t = now();
      const cutoff = t - windowMs;
      const timestamps = prune(hits.get(key) || [], cutoff);

      if (timestamps.length >= limit) {
        hits.set(key, timestamps);
        const retryAfterSec = Math.max(1, Math.ceil((timestamps[0] + windowMs - t) / 1000));
        return { allowed: false, retryAfterSec, remaining: 0 };
      }

      if (!hits.has(key) && hits.size >= MAX_TRACKED_KEYS) evict(cutoff);
      timestamps.push(t);
      hits.set(key, timestamps);
      return { allowed: true, retryAfterSec: 0, remaining: limit - timestamps.length };
    },
    reset() {
      hits.clear();
    },
  };
}

module.exports = { createRateLimiter };
