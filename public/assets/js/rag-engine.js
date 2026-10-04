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

  /* ── Query expansion ─────────────────────────────────────── */

  // Visitor vocabulary -> corpus vocabulary. Expansion terms are added to
  // the query at reduced weight (see EXPANSION_WEIGHT) so an exact match
  // on what the visitor actually typed always outranks a synonym match.
  var SYNONYMS = {
    cv: 'resume',
    resume: 'cv',
    job: 'experience work role',
    jobs: 'experience work role',
    work: 'experience',
    worked: 'experience',
    working: 'experience',
    career: 'experience history',
    employer: 'company experience',
    company: 'employer experience',
    employed: 'experience company',
    hire: 'available opportunities contact',
    hiring: 'available opportunities contact',
    recruit: 'available opportunities contact',
    available: 'opportunities',
    freelance: 'opportunities available',
    reach: 'contact email',
    mail: 'email contact',
    email: 'contact',
    phone: 'contact',
    number: 'phone contact',
    call: 'phone contact',
    linkedin: 'contact',
    github: 'contact',
    social: 'linkedin github contact',
    live: 'location based',
    lives: 'location based',
    located: 'location based',
    city: 'location pune',
    country: 'location india',
    school: 'education college university',
    college: 'education university',
    university: 'education college',
    degree: 'education bsc',
    studied: 'education degree',
    study: 'education degree',
    graduate: 'education degree',
    graduated: 'education degree',
    qualification: 'education degree certification',
    gpa: 'cgpa grade',
    marks: 'cgpa grade',
    cert: 'certification',
    certs: 'certification',
    certified: 'certification',
    certificate: 'certification',
    credential: 'certification',
    stack: 'skills technologies',
    tech: 'skills technologies',
    technologies: 'skills',
    technology: 'skills',
    tools: 'skills',
    expertise: 'skills',
    good: 'skills',
    strengths: 'skills summary',
    built: 'project',
    made: 'project',
    created: 'project',
    portfolio: 'project website',
    apps: 'project',
    app: 'project',
    ai: 'llm rag generative',
    llm: 'ai rag',
    ml: 'ai',
    bot: 'assistant chatbot robot',
    chatbot: 'assistant robot',
    robot: 'assistant chatbot',
    yourself: 'assistant',
    database: 'postgresql sql',
    db: 'database postgresql sql',
    container: 'docker kubernetes',
    containers: 'docker kubernetes',
    deploy: 'deployment cicd',
    deployment: 'cicd',
    pipeline: 'cicd',
    java: 'spring',
    achievements: 'impact highlights',
    accomplishments: 'impact highlights',
    intern: 'internship',
    internship: 'intern',
    speak: 'languages spoken english',
    salary: 'available opportunities',
    experience: 'work',
    background: 'summary experience',
    hobbies: 'interests',
  };

  var EXPANSION_WEIGHT = 0.4;

  /**
   * Query string -> { term: weight }. Terms the visitor typed get weight
   * 1; synonym expansions get EXPANSION_WEIGHT unless also typed.
   */
  function buildQueryTerms(query) {
    var weights = Object.create(null);
    var rawWords = normalize(query).split(/[^a-z0-9]+/);
    var typed = tokenize(query);
    var i;
    for (i = 0; i < typed.length; i++) weights[typed[i]] = 1;
    for (i = 0; i < rawWords.length; i++) {
      var expansion = SYNONYMS[rawWords[i]];
      if (!expansion) continue;
      var extra = tokenize(expansion);
      for (var j = 0; j < extra.length; j++) {
        if (!weights[extra[j]]) weights[extra[j]] = EXPANSION_WEIGHT;
      }
    }
    return { weights: weights, typed: typed };
  }

  /* ── Index ───────────────────────────────────────────────── */

  // BM25 parameters. k1 is a little above the textbook 1.2 because the
  // chunks are short and a repeated term really is a relevance signal;
  // b is the standard length normalisation.
  var K1 = 1.4;
  var B = 0.75;

  // BM25F-style field weights: a hit in the title or the hand-written
  // retrieval tags is worth several body hits.
  var FIELD_WEIGHTS = { title: 3, tags: 2.5, text: 1 };

  /**
   * Builds an in-memory inverted index over the knowledge chunks.
   * `knowledge` is the parsed knowledge.json ({ chunks: [...] }) or a bare
   * array of chunks. Cheap enough (~1ms for 40 chunks) to run per cold
   * start; callers should still build it once and reuse it.
   */
  function createIndex(knowledge) {
    var chunks = Array.isArray(knowledge) ? knowledge : (knowledge && knowledge.chunks) || [];
    var docs = [];
    var postings = Object.create(null); // term -> [{ doc, tf }]
    var totalLength = 0;

    chunks.forEach(function (chunk, docId) {
      var tf = Object.create(null);
      var length = 0;

      addField(tokenize(chunk.title), FIELD_WEIGHTS.title);
      addField(tokenize((chunk.tags || []).join(' ')), FIELD_WEIGHTS.tags);
      addField(tokenize(chunk.text), FIELD_WEIGHTS.text);

      function addField(terms, weight) {
        for (var i = 0; i < terms.length; i++) {
          tf[terms[i]] = (tf[terms[i]] || 0) + weight;
          length += weight;
        }
      }

      for (var term in tf) {
        (postings[term] || (postings[term] = [])).push({ doc: docId, tf: tf[term] });
      }
      docs.push({ chunk: chunk, length: length });
      totalLength += length;
    });

    var idf = Object.create(null);
    var N = docs.length;
    for (var term in postings) {
      var df = postings[term].length;
      // BM25+ style floor (the "+ 1" inside the log) keeps idf positive
      // even for terms that appear in most chunks.
      idf[term] = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    }

    return {
      docs: docs,
      postings: postings,
      idf: idf,
      avgLength: N ? totalLength / N : 0,
      size: N,
    };
  }

  return {
    tokenize: tokenize,
    normalize: normalize,
    stem: stem,
    buildQueryTerms: buildQueryTerms,
    createIndex: createIndex,
  };
}));
