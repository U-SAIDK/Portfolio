/**
 * Portfolio RAG engine — the retrieval half of the robot assistant.
 *
 * One file, no dependencies, UMD-wrapped so the exact same code runs in
 * two places and can never drift apart:
 *   - Node:    shared/chat-handler.js (the /api/chat function) requires it
 *   - Browser: chat.js lazy-loads it as window.PortfolioRAG and uses it as
 *              an offline fallback when the API is unreachable
 *
 * Pipeline: tokenize -> BM25F-style lexical ranking over the knowledge
 * chunks (title and tags weighted above body text) -> optional extractive
 * answer composed from the best-matching sentences. With ~40 short chunks
 * a lexical ranker is both faster and more predictable than embeddings,
 * and it ships to the browser in a few KB instead of a model download.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PortfolioRAG = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Tokenizer ───────────────────────────────────────────── */

  // Function words carry no retrieval signal. "he/his/usaid/khan" are in
  // here too: every chunk is about Usaid, so they match everything and
  // would only add noise to the ranking.
  var STOPWORDS = toSet(
    'a an the and or but if then so of in on at to for from by with about into over under ' +
    'is are was were be been being am do does did doing done have has had having ' +
    'i me my mine we us our you your yours he him his she her they them their it its ' +
    'this that these those there here what which who whom whose when where why how ' +
    'can could would should will shall may might must not no yes any some all more most ' +
    'tell show give explain describe list please know want need like get got let lets ' +
    'usaid khan usaids mr sir also just really very much many lot kind sort thing things ' +
    'as than too up out off again once only own same such both each few other s t d ll re ve m'
  );

  // Terms whose punctuation would otherwise be split apart ("ci/cd" ->
  // "ci", "cd") or which have a common alternate spelling. Applied to the
  // raw lower-cased string before splitting, on both documents and queries.
  var NORMALIZATIONS = [
    [/\bc\+\+/g, 'cpp'],
    [/\bci\s*\/\s*cd\b/g, 'cicd'],
    [/\b(next|node|react|three|vue|express)\.?\s?js\b/g, '$1js'],
    [/\breactjs\b/g, 'react'],
    [/\bk8s\b/g, 'kubernetes'],
    [/\bpostgres\b/g, 'postgresql'],
    [/\bspring[\s-]?boot\b/g, 'springboot spring'],
    [/\bfull[\s-]?stack\b/g, 'fullstack'],
    [/\bfront[\s-]?end\b/g, 'frontend'],
    [/\bback[\s-]?end\b/g, 'backend'],
    [/\bopen[\s-]?source\b/g, 'opensource'],
    [/\be[\s-]?mail\b/g, 'email'],
    [/\bgen[\s-]?ai\b/g, 'generative ai'],
    [/\bb\.?\s?sc\b\.?/g, 'bsc'],
  ];

  function toSet(str) {
    var set = Object.create(null);
    str.split(/\s+/).forEach(function (w) { if (w) set[w] = true; });
    return set;
  }

  function normalize(text) {
    var s = String(text == null ? '' : text).toLowerCase();
    for (var i = 0; i < NORMALIZATIONS.length; i++) {
      s = s.replace(NORMALIZATIONS[i][0], NORMALIZATIONS[i][1]);
    }
    return s;
  }

  /**
   * Text -> array of index terms (normalized, stopword-free, stemmed).
   * Pure function; the same call is used for documents and queries.
   */
  function tokenize(text) {
    var words = normalize(text).split(/[^a-z0-9]+/);
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w || STOPWORDS[w]) continue;
      // Drop lone letters ("a", "s" from possessives) but keep "c" (the
      // language), "ai" and digits like "5" in "JUnit 5".
      if (w.length === 1 && w !== 'c' && !/[0-9]/.test(w)) continue;
      out.push(stem(w));
    }
    return out;
  }

  /* ── Stemmer ─────────────────────────────────────────────── */

  // Deliberately conservative: only the suffixes that matter for matching
  // a visitor's phrasing to the corpus (plurals, -ing, -ed). A full Porter
  // stemmer conflates too much on a corpus this small ("university" and
  // "universal", "operate" and "operations").
  var STEM_EXCEPTIONS = toSet(
    'aws kubernetes jenkins redis express sass css js class access process address business ' +
    'analysis series status devops gitops this is was has does goes news ios kafka vitest ' +
    'thing string spring during testing nothing something anything building engineering'
  );

  function stem(word) {
    if (word.length < 4 || STEM_EXCEPTIONS[word] || /[0-9]/.test(word)) return word;
    if (/ies$/.test(word) && word.length > 4) return word.slice(0, -3) + 'y';
    if (/(sses|shes|ches|xes|zes)$/.test(word)) return word.slice(0, -2);
    if (/s$/.test(word) && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
    if (/ing$/.test(word) && word.length > 5) return undouble(word.slice(0, -3));
    if (/ed$/.test(word) && word.length > 4 && !/eed$/.test(word)) return undouble(word.slice(0, -2));
    return word;
  }

  // "running" -> "runn" -> "run"; leaves "skill"/"call"-style roots alone.
  function undouble(root) {
    var n = root.length;
    if (n > 2 && root[n - 1] === root[n - 2] && !/[lsz]/.test(root[n - 1])) return root.slice(0, -1);
    return root;
  }

  return {
    tokenize: tokenize,
    normalize: normalize,
    stem: stem,
  };
}));
