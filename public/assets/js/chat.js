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
})();
