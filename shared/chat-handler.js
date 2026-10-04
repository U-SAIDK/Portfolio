/**
 * Portfolio assistant request logic, shared by both deployment targets:
 *   - netlify/functions/chat.js  (production serverless function)
 *   - server/server.js           (standalone Express server, local dev)
 *
 * This is the "RAG" in the robot: validate -> rate-limit -> retrieve the
 * relevant knowledge chunks -> generate an answer grounded in them.
 *
 * Generation is optional by design. Without ANTHROPIC_API_KEY (or when
 * the API fails, times out or the daily cap is hit) the handler returns
 * an extractive answer quoted from the retrieved chunks, so the widget
 * always works and never shows a visitor a stack trace.
 */

'use strict';

const RAG = require('../public/assets/js/rag-engine.js');
const knowledge = require('../public/assets/data/knowledge.json');
const { createRateLimiter } = require('./rate-limit');
const llm = require('./chat-llm');

const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CONTENT_LENGTH = 1500;

// Per-visitor limits: generous for a human reading answers, tight for a
// script. See rate-limit.js for what "per instance" means on Netlify.
const perMinute = createRateLimiter({ limit: 8, windowMs: 60 * 1000 });
const perHour = createRateLimiter({ limit: 60, windowMs: 60 * 60 * 1000 });

// Ceiling on paid generations per instance per day, across all visitors.
// Past it the assistant keeps answering, extractively.
const DEFAULT_DAILY_GENERATION_LIMIT = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
let dailyLimiter = null;
let dailyLimiterSize = null;
function allowGeneration(env) {
  const limit = Number(env.CHAT_DAILY_LIMIT) > 0 ? Number(env.CHAT_DAILY_LIMIT) : DEFAULT_DAILY_GENERATION_LIMIT;
  if (!dailyLimiter || dailyLimiterSize !== limit) {
    dailyLimiter = createRateLimiter({ limit, windowMs: DAY_MS });
    dailyLimiterSize = limit;
  }
  return dailyLimiter.check('global').allowed;
}

// Built once per cold start and reused across warm invocations.
const index = RAG.createIndex(knowledge);

function fail(status, error, extra) {
  return { status, body: Object.assign({ success: false, error }, extra) };
}

function ok(answer, sources, mode) {
  return { status: 200, body: { success: true, answer, sources, mode } };
}

/**
 * Accepts only well-formed prior turns and silently drops the rest: the
 * history is supplied by the browser, so it is untrusted input, but a
 * malformed entry shouldn't fail an otherwise valid question.
 */
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((turn) => turn
      && (turn.role === 'user' || turn.role === 'assistant')
      && typeof turn.content === 'string'
      && turn.content.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content.trim().slice(0, MAX_HISTORY_CONTENT_LENGTH) }));
}

function lastUserQuestion(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content;
  }
  return '';
}

/**
 * @param {{ question?: unknown, history?: unknown }} payload  parsed JSON body
 * @param {NodeJS.ProcessEnv} env
 * @param {{ ip?: string, generate?: Function }} [context]
 *        `generate` is injectable for tests; defaults to the Claude call.
 * @returns {Promise<{ status: number, body: object }>}
 */
async function handleChat(payload, env, context = {}) {
  const { ip = 'unknown', generate = llm.generateAnswer } = context;

  if (!payload || typeof payload !== 'object') {
    return fail(400, 'Malformed request body.');
  }

  const { question } = payload;
  if (typeof question !== 'string' || !question.trim()) {
    return fail(400, 'Please enter a question.');
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return fail(400, `Please keep your question under ${MAX_QUESTION_LENGTH} characters.`);
  }

  for (const limiter of [perMinute, perHour]) {
    const verdict = limiter.check(ip);
    if (!verdict.allowed) {
      return fail(429, "You're asking faster than I can answer. Give me a moment and try again.", {
        retryAfter: verdict.retryAfterSec,
      });
    }
  }

  const trimmed = question.trim();
  const history = sanitizeHistory(payload.history);

  const greeting = RAG.smallTalk(trimmed);
  if (greeting) return ok(greeting, [], 'smalltalk');

  // Retrieval gates generation: a question with no support in the corpus
  // never reaches the model. That keeps answers grounded and stops the
  // endpoint from being usable as a free general-purpose LLM proxy.
  const result = RAG.search(index, RAG.prepareQuery(trimmed, lastUserQuestion(history)));
  if (!result.confident) return ok(RAG.OUT_OF_SCOPE, [], 'out_of_scope');

  const sources = RAG.toSources(result.hits);

  if (llm.isConfigured(env) && allowGeneration(env)) {
    const generated = await generate({ question: trimmed, hits: result.hits, history, env });
    if (generated) return ok(generated, sources, 'generative');
  }

  return ok(RAG.composeAnswer(index, trimmed, result.hits), sources, 'extractive');
}

/** Test hook: clears limiter state between cases. */
function resetLimits() {
  perMinute.reset();
  perHour.reset();
  dailyLimiter = null;
}

module.exports = {
  handleChat,
  sanitizeHistory,
  resetLimits,
  MAX_QUESTION_LENGTH,
  MAX_HISTORY_TURNS,
};
