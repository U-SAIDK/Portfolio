/**
 * Contact form: client-side validation, loading state, and submission to
 * the /api/contact endpoint (netlify/functions/contact.js in production,
 * or the standalone Express server in server/ during local dev without
 * the Netlify CLI). See shared/contact-handler.js for the server-side
 * counterpart of this validation.
 */
(function () {
  'use strict';

  const form = document.getElementById('contact-form');
  if (!form) return;

  const submitBtn = form.querySelector('.f-submit');
  const submitLabel = submitBtn.querySelector('.f-submit-label');
  const statusEl = document.getElementById('f-status');

  const fields = {
    name: { input: document.getElementById('f-name'), error: document.getElementById('f-name-error'), maxLength: 100 },
    email: { input: document.getElementById('f-email'), error: document.getElementById('f-email-error') },
    message: { input: document.getElementById('f-msg'), error: document.getElementById('f-msg-error'), maxLength: 5000 },
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Local dev without the Netlify CLI (e.g. VS Code Live Server) can't
  // resolve the /api/* redirect defined in netlify.toml, so those setups
  // fall back to the standalone Express server in server/. Both `netlify
  // dev` and the production site serve everything from one origin, where
  // a relative path is correct.
  const STANDALONE_STATIC_PORTS = new Set(['5500', '5501', '3000', '8080']);
  const API_BASE_URL = STANDALONE_STATIC_PORTS.has(window.location.port) ? 'http://localhost:5000' : '';

  function setFieldError(key, message) {
    const field = fields[key];
    field.error.textContent = message || '';
    field.input.closest('.f-group').classList.toggle('has-error', Boolean(message));
  }

  function clearErrors() {
    Object.keys(fields).forEach((key) => setFieldError(key, ''));
  }

  function validate() {
    clearErrors();
    let firstInvalid = null;

    const name = fields.name.input.value.trim();
    if (!name) { setFieldError('name', 'Please enter your name.'); firstInvalid = firstInvalid || fields.name.input; }
    else if (name.length > fields.name.maxLength) { setFieldError('name', `Keep it under ${fields.name.maxLength} characters.`); firstInvalid = firstInvalid || fields.name.input; }

    const email = fields.email.input.value.trim();
    if (!email) { setFieldError('email', 'Please enter your email.'); firstInvalid = firstInvalid || fields.email.input; }
    else if (!EMAIL_RE.test(email)) { setFieldError('email', 'That email address doesn\'t look right.'); firstInvalid = firstInvalid || fields.email.input; }

    const message = fields.message.input.value.trim();
    if (!message) { setFieldError('message', 'Please add a short message.'); firstInvalid = firstInvalid || fields.message.input; }
    else if (message.length > fields.message.maxLength) { setFieldError('message', `Keep it under ${fields.message.maxLength} characters.`); firstInvalid = firstInvalid || fields.message.input; }

    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  function setStatus(message, state) {
    statusEl.textContent = message;
    if (state) statusEl.setAttribute('data-state', state);
    else statusEl.removeAttribute('data-state');
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.remove('is-success', 'is-error');
    submitLabel.textContent = isLoading ? 'Sending…' : 'Send Message →';
    const existingSpinner = submitBtn.querySelector('.f-spinner');
    if (isLoading && !existingSpinner) {
      const spinner = document.createElement('span');
      spinner.className = 'f-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      submitBtn.prepend(spinner);
    } else if (!isLoading && existingSpinner) {
      existingSpinner.remove();
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot — bots that fill every field trip this; humans never see it.
    if (form.querySelector('[name="botcheck"]').checked) return;

    if (!validate()) {
      setStatus('Please fix the highlighted fields.', 'error');
      return;
    }

    const token = document.querySelector('[name="cf-turnstile-response"]')?.value;
    if (!token) {
      setStatus('Please complete the verification challenge above.', 'error');
      return;
    }

    const payload = {
      name: fields.name.input.value.trim(),
      email: fields.email.input.value.trim(),
      subject: document.getElementById('f-subject').value.trim() || 'Portfolio Inquiry',
      message: fields.message.input.value.trim(),
      token,
    };

    setLoading(true);
    setStatus('Sending your message…');

    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('Unexpected response from the server.');
      }

      if (!response.ok || !result.success) {
        if (result.details) console.error('Contact form rejected:', result.details);
        throw new Error(result.error || 'Something went wrong. Please try again.');
      }

      setLoading(false);
      submitBtn.classList.add('is-success');
      submitLabel.textContent = '✓ Message Sent!';
      setStatus('Thanks — I\'ll get back to you within 24 hours.', 'success');
      form.reset();
      clearErrors();
      if (window.turnstile) window.turnstile.reset();

      setTimeout(() => {
        submitBtn.classList.remove('is-success');
        submitLabel.textContent = 'Send Message →';
      }, 4000);
    } catch (err) {
      console.error('Contact form error:', err);
      setLoading(false);
      submitBtn.classList.add('is-error');
      submitLabel.textContent = '✗ Failed — Try Again';
      setStatus(err.message || 'Message could not be sent. Please try again.', 'error');

      setTimeout(() => {
        submitBtn.classList.remove('is-error');
        submitLabel.textContent = 'Send Message →';
      }, 4000);
    }
  });

  // Clear a field's error as soon as the visitor starts fixing it.
  Object.keys(fields).forEach((key) => {
    fields[key].input.addEventListener('input', () => setFieldError(key, ''), { passive: true });
  });
})();
