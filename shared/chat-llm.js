/**
 * Generation step for the portfolio assistant: turns a question plus its
 * retrieved context into a written answer using the Claude API.
 *
 * Returns null instead of throwing for every "couldn't produce an answer"
 * outcome (no key, API error, timeout, refusal, empty output) so the
 * caller has exactly one fallback path: the extractive answer.
 */

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT, buildMessages } = require('./chat-prompt');

const DEFAULT_MODEL = 'claude-opus-5-5';

// Netlify's synchronous functions are killed at 10s. Give the model
// most of that, and leave headroom to return the extractive fallback.
const REQUEST_TIMEOUT_MS = 8500;

// Answers are a few sentences, but adaptive thinking shares this budget,
// so it is sized well above the expected visible output.
const MAX_TOKENS = 4096;

let cachedClient = null;
let cachedKey = null;
function getClient(apiKey) {
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new Anthropic({ apiKey });
    cachedKey = apiKey;
  }
  return cachedClient;
}

function isConfigured(env) {
  return Boolean(env && env.ANTHROPIC_API_KEY);
}

function buildRequest(model, question, hits, history) {
  const request = {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: buildMessages(question, hits, history),
  };

  // Current Opus/Sonnet/Fable models think adaptively by default; a short
  // grounded Q&A needs very little of it, so run at low effort. They can
  // also decline a request via a safety classifier, in which case the
  // server-side fallback re-runs it on Anthropic's recommended substitute.
  // Older or smaller models (e.g. a CHAT_MODEL override to Haiku) reject
  // both parameters, so only send them where they're supported.
  if (/^claude-(opus|sonnet|fable)-5/.test(model)) {
    request.output_config = { effort: 'low' };
    request.betas = ['server-side-fallback-2026-07-01'];
    request.fallbacks = 'default';
  }
  return request;
}

function extractText(response) {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * @returns {Promise<string|null>} the answer, or null to fall back
 */
async function generateAnswer({ question, hits, history, env }) {
  if (!isConfigured(env)) return null;

  const model = env.CHAT_MODEL || DEFAULT_MODEL;
  const client = getClient(env.ANTHROPIC_API_KEY);
  const request = buildRequest(model, question, hits, history);

  try {
    // No SDK retries: with a 10s platform limit a retry can't finish, and
    // the extractive fallback is a better use of the remaining time.
    const options = { timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 };
    const response = request.betas
      ? await client.beta.messages.create(request, options)
      : await client.messages.create(request, options);

    if (response.stop_reason === 'refusal') {
      console.warn('Chat generation declined:', response.stop_details && response.stop_details.category);
      return null;
    }

    const text = extractText(response);
    if (!text) {
      console.warn('Chat generation returned no text; stop_reason =', response.stop_reason);
      return null;
    }
    return text;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('Chat generation failed: ANTHROPIC_API_KEY was rejected.');
    } else if (error instanceof Anthropic.RateLimitError) {
      console.warn('Chat generation rate-limited by the API.');
    } else if (error instanceof Anthropic.APIConnectionTimeoutError) {
      console.warn(`Chat generation timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    } else if (error instanceof Anthropic.APIConnectionError) {
      console.warn('Chat generation could not reach the API:', error.message);
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Chat generation API error ${error.status}:`, error.message);
    } else {
      console.error('Chat generation failed unexpectedly:', error);
    }
    return null;
  }
}

module.exports = { generateAnswer, isConfigured, buildRequest, extractText, DEFAULT_MODEL };
