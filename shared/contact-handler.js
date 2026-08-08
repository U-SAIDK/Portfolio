/**
 * Shared contact-form logic used by both deployment targets:
 *   - server/server.js              (standalone Express server, local dev)
 *   - netlify/functions/contact.js  (production serverless function)
 *
 * Keeping this in one place means validation, spam-checking and email
 * delivery can never drift out of sync between the two entry points.
 */

'use strict';

const nodemailer = require('nodemailer');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 8000;

const MAX_NAME_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 5000;

// RFC-5322-ish "good enough" email check. Deliberately simple: it exists to
// catch typos and header-injection attempts, not to be a full validator.
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// A mailer transport is cheap to reuse across invocations (and across
// Lambda warm starts), so cache it instead of recreating it per request.
let cachedTransporter = null;
function getTransporter(env) {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return cachedTransporter;
}

/**
 * Fails fast with a clear, loggable reason instead of letting a missing
 * secret surface later as an opaque nodemailer/Turnstile error.
 */
function findMissingEnvVars(env) {
  const required = ['SMTP_USER', 'SMTP_PASS', 'TURNSTILE_SECRET_KEY'];
  return required.filter((key) => !env[key]);
}

// Defense in depth against mail-header injection: even though modern
// nodemailer strips CR/LF from header values itself, user input never
// belongs unsanitized in a header we build (the subject line here).
function sanitizeHeaderValue(value) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function validateFields({ name, email, message }) {
  const errors = [];

  if (!name || !name.trim()) errors.push('Name is required.');
  else if (name.length > MAX_NAME_LENGTH) errors.push(`Name must be under ${MAX_NAME_LENGTH} characters.`);

  if (!email || !email.trim()) errors.push('Email is required.');
  else if (!EMAIL_RE.test(email.trim())) errors.push('Please provide a valid email address.');

  if (!message || !message.trim()) errors.push('Message is required.');
  else if (message.length > MAX_MESSAGE_LENGTH) errors.push(`Message must be under ${MAX_MESSAGE_LENGTH} characters.`);

  return errors;
}

async function verifyTurnstileToken(token, secretKey) {
  const params = new URLSearchParams();
  params.append('secret', secretKey);
  params.append('response', token);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: params,
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Handles one contact-form submission end to end.
 *
 * @param {object} payload - { name, email, subject, message, token, botcheck }
 * @param {object} env - process.env (or an equivalent object) with the
 *   SMTP_USER, SMTP_PASS, MAIL_TO and TURNSTILE_SECRET_KEY vars.
 * @returns {Promise<{status: number, body: object}>}
 */
async function handleContactSubmission(payload, env) {
  const { name, email, subject, message, token, botcheck } = payload || {};

  // Silently "succeed" on honeypot hits so bots don't learn anything.
  if (botcheck) {
    return { status: 200, body: { success: true } };
  }

  const missingEnvVars = findMissingEnvVars(env);
  if (missingEnvVars.length) {
    console.error(`Contact form misconfigured — missing env vars: ${missingEnvVars.join(', ')}`);
    return {
      status: 500,
      body: { success: false, error: 'Email service is not configured. Please email me directly instead.' },
    };
  }

  if (!token) {
    return { status: 400, body: { success: false, error: 'Missing verification token. Please complete the challenge and try again.' } };
  }

  const fieldErrors = validateFields({ name, email, message });
  if (fieldErrors.length) {
    return { status: 400, body: { success: false, error: fieldErrors[0], details: fieldErrors } };
  }

  let turnstileOutcome;
  try {
    turnstileOutcome = await verifyTurnstileToken(token, env.TURNSTILE_SECRET_KEY);
  } catch (err) {
    console.error('Turnstile verification request failed:', err);
    return { status: 502, body: { success: false, error: 'Could not verify you are human. Please try again.' } };
  }

  if (!turnstileOutcome.success) {
    console.error('Turnstile verification failed:', turnstileOutcome['error-codes']);
    return {
      status: 400,
      body: { success: false, error: 'Verification failed. Please retry the challenge.', details: turnstileOutcome['error-codes'] },
    };
  }

  const trimmedSubject = sanitizeHeaderValue(subject || '').slice(0, MAX_SUBJECT_LENGTH) || 'New Message';

  try {
    await getTransporter(env).sendMail({
      from: env.SMTP_USER,
      to: env.MAIL_TO || env.SMTP_USER,
      replyTo: email.trim(),
      subject: `Portfolio Contact: ${trimmedSubject}`,
      text: `Name: ${name.trim()}\nEmail: ${email.trim()}\n\nMessage:\n${message.trim()}`,
    });
  } catch (err) {
    console.error('Failed to send contact email:', err);
    return { status: 502, body: { success: false, error: 'Message could not be sent right now. Please try again shortly.' } };
  }

  return { status: 200, body: { success: true, message: 'Message sent successfully.' } };
}

module.exports = { handleContactSubmission };
