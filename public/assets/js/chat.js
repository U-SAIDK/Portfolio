/**
 * Portfolio assistant — the Q&A panel opened from the hero robot (or the
 * floating launcher when the robot is off-screen).
 *
 * Flow per question: POST /api/chat (netlify/functions/chat.js), which
 * retrieves the relevant knowledge chunks and writes a grounded answer.
 * If the API can't be reached at all (plain static hosting, offline, a
 * cold-start timeout) the same retrieval engine is lazy-loaded here and
 * answers from the same corpus in the browser — so the widget degrades
 * to "quotes the right passage" rather than to an error.
 *
 * The robot reacts through a `uk-chat` event on <html> (see robot.js);
 * this file never touches the Three.js scene directly.
 */
(function () {
  'use strict';

  var panel = document.getElementById('chat-panel');
  if (!panel) return;

  var root = document.documentElement;
  var log = document.getElementById('chat-log');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send');
  var closeBtn = document.getElementById('chat-close');
  var suggestionsEl = document.getElementById('chat-suggestions');
  var fab = document.getElementById('chat-fab');
  var robotWidget = document.getElementById('robot-widget');
  var openers = document.querySelectorAll('[data-chat-open]');

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Rendering ───────────────────────────────────────────── */

  // Answers use a tiny markdown subset (paragraphs, "- " bullets, **bold**,
  // bare URLs and emails). Everything is built with DOM nodes and
  // textContent — never innerHTML — so neither a model answer nor a
  // visitor's own question can inject markup.
  var INLINE = /(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

  function appendInline(parent, text) {
    var last = 0;
    var match;
    INLINE.lastIndex = 0;
    while ((match = INLINE.exec(text))) {
      if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)));
      if (match[1]) {
        var strong = document.createElement('strong');
        strong.textContent = match[1].slice(2, -2);
        parent.appendChild(strong);
      } else {
        var link = document.createElement('a');
        link.textContent = match[0];
        if (match[2]) {
          link.href = match[2];
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        } else {
          link.href = 'mailto:' + match[3];
        }
        parent.appendChild(link);
      }
      last = INLINE.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderAnswer(container, text) {
    container.textContent = '';
    var list = null;
    var paragraph = null;

    String(text).split('\n').forEach(function (rawLine) {
      var line = rawLine.trim();
      if (!line) { list = null; paragraph = null; return; }

      var bullet = /^[-*•]\s+(.*)$/.exec(line);
      if (bullet) {
        if (!list) {
          list = document.createElement('ul');
          container.appendChild(list);
        }
        var item = document.createElement('li');
        appendInline(item, bullet[1]);
        list.appendChild(item);
        paragraph = null;
        return;
      }

      list = null;
      if (!paragraph) {
        paragraph = document.createElement('p');
        container.appendChild(paragraph);
      } else {
        paragraph.appendChild(document.createTextNode(' '));
      }
      appendInline(paragraph, line);
    });
  }

  function scrollToEnd() {
    log.scrollTop = log.scrollHeight;
  }

  // For an answer taller than the log, following the end would scroll its
  // first lines out of view before anyone has read them. Follow the end
  // only until the bubble's top reaches the top of the log, then hold.
  function keepInView(bubble) {
    var end = log.scrollHeight - log.clientHeight;
    log.scrollTop = Math.max(0, Math.min(end, bubble.offsetTop - 10));
  }

  /**
   * Adds a bubble to the log. `role` is 'user', 'bot' or 'error'.
   * Returns the bubble element so callers can fill or replace it.
   */
  function addMessage(role, text) {
    var bubble = document.createElement('div');
    bubble.className = 'chat-msg ' + (role === 'user' ? 'is-user' : 'is-bot') + (role === 'error' ? ' is-error' : '');
    if (role === 'user') bubble.textContent = text;
    else if (text) renderAnswer(bubble, text);
    log.appendChild(bubble);
    scrollToEnd();
    return bubble;
  }

  function addSources(bubble, sources) {
    if (!sources || !sources.length) return;
    var row = document.createElement('div');
    row.className = 'chat-sources';

    var label = document.createElement('span');
    label.className = 'chat-sources-label';
    label.textContent = 'From';
    row.appendChild(label);

    var seen = {};
    sources.forEach(function (source) {
      // Several chunks can share a page section; one chip per section.
      if (seen[source.section]) return;
      seen[source.section] = true;
      var chip = document.createElement('a');
      chip.className = 'chat-source';
      chip.href = '#' + source.section;
      chip.textContent = SECTION_LABELS[source.section] || source.section;
      chip.title = source.title;
      row.appendChild(chip);
    });

    bubble.appendChild(row);
    keepInView(bubble);
  }

  var SECTION_LABELS = {
    hero: 'Home',
    about: 'About',
    skills: 'Skills',
    projects: 'Projects',
    experience: 'Experience',
    resume: 'Resume',
    certifications: 'Certifications',
    education: 'Education',
    contact: 'Contact',
  };

  /* ── Greeting & suggested questions ──────────────────────── */

  var GREETING =
    "Hi! I'm Usaid's assistant. Ask me anything about his skills, projects, experience or how to reach him.";

  var SUGGESTIONS = [
    'What are his main skills?',
    'Tell me about his projects',
    'Where does he work?',
    'How can I contact him?',
  ];

  function renderSuggestions(onPick) {
    suggestionsEl.textContent = '';
    SUGGESTIONS.forEach(function (question) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'chat-suggestion';
      button.textContent = question;
      button.addEventListener('click', function () { onPick(question); });
      suggestionsEl.appendChild(button);
    });
  }

  function clearSuggestions() {
    suggestionsEl.textContent = '';
  }

  /* ── Transport: /api/chat ────────────────────────────────── */

  // Same convention as contact-form.js: a plain static server on one of
  // these ports can't resolve the /api/* redirect, so talk to the
  // standalone Express server instead. Everywhere else (netlify dev,
  // production) the API is same-origin.
  var STANDALONE_STATIC_PORTS = ['5500', '5501', '3000', '8080'];
  var API_BASE_URL = STANDALONE_STATIC_PORTS.indexOf(window.location.port) !== -1 ? 'http://localhost:5000' : '';

  // Slightly above the function's own 10s ceiling, so a slow answer is
  // the server's to time out and report, not the browser's to abandon.
  var REQUEST_TIMEOUT_MS = 13000;
  var MAX_HISTORY_TURNS = 6;

  var history = []; // [{ role: 'user' | 'assistant', content }]

  /**
   * Resolves with { answer, sources, mode } for any response the server
   * meant to send (including 4xx with a message, surfaced as `error`).
   * Rejects only when the API is unreachable or broken, which is the
   * caller's signal to use the local engine instead.
   */
  function askApi(question) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);

    return fetch(API_BASE_URL + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question, history: history.slice(-MAX_HISTORY_TURNS) }),
      signal: controller ? controller.signal : undefined,
    }).then(function (response) {
      // A static host answers /api/chat with an HTML 404/200 page; only a
      // JSON body counts as "the API responded".
      var type = response.headers.get('content-type') || '';
      if (type.indexOf('application/json') === -1) throw new Error('API unavailable (' + response.status + ')');

      return response.json().then(function (data) {
        if (response.ok && data && data.success && typeof data.answer === 'string') return data;
        // Validation and rate-limit errors carry a message meant for the visitor.
        if (response.status >= 400 && response.status < 500 && data && data.error) return { error: data.error };
        throw new Error('API error (' + response.status + ')');
      });
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  /* ── Fallback: retrieval in the browser ──────────────────── */

  var localEngine = null; // Promise<{ RAG, index }>, created on first use

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(script);
    });
  }

  function getLocalEngine() {
    if (!localEngine) {
      localEngine = Promise.all([
        window.PortfolioRAG ? Promise.resolve() : loadScript('assets/js/rag-engine.js'),
        fetch('assets/data/knowledge.json').then(function (response) {
          if (!response.ok) throw new Error('knowledge.json ' + response.status);
          return response.json();
        }),
      ]).then(function (results) {
        return { RAG: window.PortfolioRAG, index: window.PortfolioRAG.createIndex(results[1]) };
      }).catch(function (error) {
        localEngine = null; // allow a retry on the next question
        throw error;
      });
    }
    return localEngine;
  }

  function lastUserQuestion() {
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') return history[i].content;
    }
    return '';
  }

  function askLocal(question) {
    return getLocalEngine().then(function (engine) {
      var result = engine.RAG.answer(engine.index, question, lastUserQuestion());
      return { answer: result.answer, sources: result.sources, mode: 'local' };
    });
  }
})();
