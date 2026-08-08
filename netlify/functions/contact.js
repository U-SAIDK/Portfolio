/**
 * Production contact-form endpoint, served at /api/contact via the
 * redirect rule in netlify.toml. See ../../shared/contact-handler.js for
 * the actual validation / Turnstile / email-sending logic shared with the
 * local Express dev server.
 *
 * IMPORTANT: SMTP_USER, SMTP_PASS, MAIL_TO and TURNSTILE_SECRET_KEY must be
 * configured under Site settings → Environment variables in the Netlify
 * dashboard. Netlify does NOT read a repo .env file for deployed functions
 * — that file is only used by `netlify dev` for local testing.
 */

'use strict';

const { handleContactSubmission } = require('../../shared/contact-handler');

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ success: false, error: 'Malformed request body' }) };
  }

  try {
    const { status, body } = await handleContactSubmission(payload, process.env);
    return { statusCode: status, headers: HEADERS, body: JSON.stringify(body) };
  } catch (error) {
    console.error('Unexpected error processing contact form:', error);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ success: false, error: 'Internal server error' }) };
  }
};
