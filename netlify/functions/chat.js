/**
 * Production endpoint for the portfolio assistant, served at /api/chat
 * via the redirect rule in netlify.toml. See ../../shared/chat-handler.js
 * for the retrieval + generation logic shared with the local Express
 * dev server.
 *
 * Optional environment variables (Site settings → Environment variables):
 *   ANTHROPIC_API_KEY  enables written answers; without it the assistant
 *                      answers by quoting the retrieved passages
 *   CHAT_MODEL         model override (default: claude-opus-5-5)
 *   CHAT_DAILY_LIMIT   max generated answers per instance per day
 */

'use strict';

const { handleChat } = require('../../shared/chat-handler');

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  // Answers depend on the question body; never let a proxy cache them.
  'Cache-Control': 'no-store',
};

// A question is at most 500 chars and history is capped at 6 short
// turns, so anything much larger than this is not a real chat request.
const MAX_BODY_BYTES = 16 * 1024;

function respond(statusCode, body, extraHeaders) {
  return { statusCode, headers: Object.assign({}, HEADERS, extraHeaders), body: JSON.stringify(body) };
}

// Netlify sets x-nf-client-connection-ip to the real client address;
// x-forwarded-for is the fallback for `netlify dev` and other proxies.
function clientIp(headers = {}) {
  return headers['x-nf-client-connection-ip']
    || (headers['x-forwarded-for'] || '').split(',')[0].trim()
    || 'unknown';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { success: false, error: 'Method Not Allowed' }, { Allow: 'POST, OPTIONS' });
  }

  if (event.body && Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES) {
    return respond(413, { success: false, error: 'Request too large.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { success: false, error: 'Malformed request body' });
  }

  try {
    const { status, body } = await handleChat(payload, process.env, { ip: clientIp(event.headers) });
    const extra = status === 429 && body.retryAfter ? { 'Retry-After': String(body.retryAfter) } : undefined;
    return respond(status, body, extra);
  } catch (error) {
    console.error('Unexpected error processing chat request:', error);
    return respond(500, { success: false, error: 'Internal server error' });
  }
};
