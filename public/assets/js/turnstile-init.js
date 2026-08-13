/**
 * Cloudflare Turnstile — single, explicit, idempotent lifecycle.
 *
 * Loaded plainly (no async/defer) in index.html, immediately before the
 * Turnstile <script> tag, so window.onTurnstileLoad is guaranteed to exist
 * before Turnstile can possibly call it. The Turnstile tag is `async`,
 * and an async script can execute before any `defer` script has run —
 * had this logic lived in contact-form.js (which is `defer`) instead,
 * there'd be a real race where Cloudflare calls an onload handler that
 * doesn't exist yet.
 *
 * The Turnstile script URL uses `render=explicit&onload=onTurnstileLoad`:
 * Cloudflare will NOT auto-scan the DOM for `.cf-turnstile` and render
 * into it on its own — we render it ourselves, exactly once, when
 * onTurnstileLoad fires (which itself only ever fires once, since the
 * script only loads once). No polling, no retry loop, no interval: every
 * state change here is driven by a real Turnstile/browser event
 * (onload, onerror, the widget's own success/expired/error callbacks).
 *
 * contact-form.js consumes this through three small functions
 * (getTurnstileState, getTurnstileToken, resetTurnstile) instead of
 * touching window.turnstile or the DOM directly.
 */
(function () {
  'use strict';

  var widgetId = null;
  var token = '';
  var scriptFailed = false;
  var widgetErrored = false;

  // Wired to the Turnstile <script> tag's onerror= attribute in
  // index.html — fires once, only if the script truly fails to load
  // (network error, blocked request, etc.).
  window.onTurnstileScriptError = function () {
    scriptFailed = true;
  };

  // Wired to the Turnstile <script> tag's src `onload=` query param —
  // Cloudflare calls this exactly once, right after api.js finishes
  // loading and `window.turnstile` becomes available.
  window.onTurnstileLoad = function () {
    // Idempotency guard: even though this should only ever fire once,
    // never render a second widget if it somehow did.
    if (widgetId !== null || !window.turnstile) return;

    var container = document.querySelector('.cf-turnstile');
    var sitekey = container && container.getAttribute('data-sitekey');
    if (!container || !sitekey) return;

    widgetId = window.turnstile.render(container, {
      sitekey: sitekey,
      callback: function (t) {
        token = t;
        // A later success (e.g. Cloudflare's own internal retry quietly
        // resolving a transient failure) supersedes an earlier error.
        widgetErrored = false;
      },
      'expired-callback': function () {
        token = '';
        // Keep a fresh token ready for whenever the visitor actually
        // submits — resets THIS widget instance in place, does not
        // create a new one.
        if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      },
      'error-callback': function () {
        // This is what fires for a failed/undeliverable challenge —
        // including Cloudflare-side infrastructure errors (e.g. the
        // in-widget "Troubleshoot / Error Code: 110200" card) — not just
        // problems on our end. Tracked as its own state (see
        // getTurnstileState below) so the status message can say the
        // verification itself failed, rather than "Verifying…" forever.
        token = '';
        widgetErrored = true;
        // Deliberately no auto-retry/auto-reset here — a persistent
        // failure would otherwise loop. The visitor gets an accurate
        // status message from contact-form.js and can refresh to retry.
      },
    });
  };

  window.getTurnstileState = function () {
    if (scriptFailed) return 'unavailable'; // api.js itself never loaded
    if (!window.turnstile || widgetId === null) return 'loading'; // loaded, not yet rendered
    if (widgetErrored) return 'error'; // rendered, but the challenge failed (widget or Cloudflare-side)
    if (!token) return 'pending'; // rendered, verifying, no token yet
    return 'ready';
  };

  window.getTurnstileToken = function () {
    return token;
  };

  window.resetTurnstile = function () {
    token = '';
    widgetErrored = false;
    if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
  };
})();
