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
    'tell show give explain describe list please know want need like get got let lets use used using ' +
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
    // "js" is excluded so normalised names (nextjs, nodejs) survive intact.
    if (/s$/.test(word) && !/(ss|us|is|js)$/.test(word)) return word.slice(0, -1);
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

  /* ── Search ──────────────────────────────────────────────── */

  // A result must clear this BM25 score AND match at least one term the
  // visitor actually typed, otherwise the question is treated as out of
  // scope. Calibrated against tests/rag-engine.test.js: on-topic
  // questions land well above 3, unrelated ones ("capital of France")
  // score 0 because none of their terms exist in the corpus.
  var MIN_SCORE = 1.6;
  var MIN_COVERAGE = 0.5;

  /**
   * Ranks chunks for a query.
   * Returns { hits: [{ chunk, score }], confident, coverage, terms } where
   * `coverage` is the fraction of typed query terms found in the corpus
   * at all, and `confident` says whether the top hit is good enough to
   * answer from.
   */
  function search(index, query, options) {
    var limit = (options && options.limit) || 5;
    var q = buildQueryTerms(query);
    var scores = Object.create(null);
    var typedMatched = Object.create(null); // docId -> count of typed terms matched

    for (var term in q.weights) {
      var list = index.postings[term];
      if (!list) continue;
      var weight = q.weights[term];
      var isTyped = weight === 1;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var doc = index.docs[p.doc];
        var norm = 1 - B + B * (doc.length / index.avgLength);
        var termScore = index.idf[term] * (p.tf * (K1 + 1)) / (p.tf + K1 * norm);
        scores[p.doc] = (scores[p.doc] || 0) + termScore * weight;
        // Bare numbers don't count as evidence: "what is 2+2" must not be
        // answered just because some chunk mentions "2,374 tests".
        if (isTyped && /[a-z]/.test(term)) typedMatched[p.doc] = (typedMatched[p.doc] || 0) + 1;
      }
    }

    var uniqueTyped = unique(q.typed);
    var known = 0;
    for (var t = 0; t < uniqueTyped.length; t++) {
      if (index.postings[uniqueTyped[t]]) known++;
    }
    var coverage = uniqueTyped.length ? known / uniqueTyped.length : 0;

    var ranked = Object.keys(scores)
      .map(function (id) { return { chunk: index.docs[id].chunk, score: scores[id], doc: +id }; })
      .sort(function (a, b) { return b.score - a.score || a.doc - b.doc; });

    var top = ranked[0];
    // Coverage gate: when most of what the visitor typed doesn't exist
    // anywhere in the corpus ("best pizza in naples" -> only "best" is
    // known), one incidental match is not grounds to answer.
    var confident = !!top && top.score >= MIN_SCORE && typedMatched[top.doc] > 0 && coverage >= MIN_COVERAGE;

    // Drop the long tail: anything under 35% of the best score is noise
    // that would only dilute the prompt.
    var cutoff = top ? top.score * 0.35 : 0;
    var hits = ranked
      .filter(function (r) { return r.score >= cutoff; })
      .slice(0, limit)
      .map(function (r) { return { chunk: r.chunk, score: round(r.score) }; });

    return { hits: confident ? hits : [], confident: confident, coverage: round(coverage), terms: uniqueTyped };
  }

  function unique(list) {
    var seen = Object.create(null);
    return list.filter(function (x) { return seen[x] ? false : (seen[x] = true); });
  }

  function round(n) { return Math.round(n * 1000) / 1000; }

  // Follow-ups like "what did he build there?" or "and the stack?" carry
  // almost no retrievable terms on their own. When the current question
  // is that thin, retrieve on it plus the previous question.
  var REFERENTIAL = /\b(it|that|this|those|them|there|one|same|also|more|else|another)\b/i;

  function contextualQuery(question, previousQuestion) {
    if (!previousQuestion) return question;
    var terms = unique(tokenize(question));
    if (terms.length <= 1 || (terms.length <= 3 && REFERENTIAL.test(question))) {
      return question + ' ' + previousQuestion;
    }
    return question;
  }

  /* ── Small talk ──────────────────────────────────────────── */

  // Greetings and thanks have no retrievable content, so they are caught
  // before search rather than being reported as "out of scope".
  var SMALL_TALK = [
    {
      test: /^\s*(hi+|hey+|hello+|yo|hola|namaste|salam|good\s+(morning|afternoon|evening)|sup|what'?s\s+up)[\s!.,?]*$/i,
      reply: "Hi! I'm Usaid's portfolio assistant. Ask me about his skills, projects, work experience, certifications, or how to get in touch.",
    },
    {
      test: /^\s*(thanks?(\s+you)?|thank\s+you(\s+so\s+much)?|thx|ty|cheers|great|nice|cool|awesome|perfect|ok(ay)?|got\s+it)[\s!.,]*$/i,
      reply: "You're welcome! Anything else you'd like to know about Usaid?",
    },
    {
      test: /^\s*(bye+|goodbye|see\s+(you|ya)|cya)[\s!.,]*$/i,
      reply: 'Thanks for stopping by! If you want to reach Usaid, his email is usaidk.tech@gmail.com.',
    },
  ];

  function smallTalk(question) {
    for (var i = 0; i < SMALL_TALK.length; i++) {
      if (SMALL_TALK[i].test.test(question)) return SMALL_TALK[i].reply;
    }
    return null;
  }

  // Questions made entirely of stopwords ("who is he?", "who are you?")
  // tokenize to nothing. Rewrite the common ones to a canonical query so
  // they retrieve the chunk that actually answers them.
  var INTENT_REWRITES = [
    {
      test: /\b(who|what)\s+(are|r)\s+(you|u)\b|\babout\s+yourself\b|\bwhat\s+can\s+(you|u)\s+do\b|\byour\s+name\b|\bare\s+you\s+(a\s+)?(real|human|bot|ai)\b/i,
      query: 'assistant chatbot robot what can you do',
    },
    {
      test: /\bwho\s+is\s+(he|usaid|this|this\s+guy)\b|\bwho'?s\s+usaid\b|\babout\s+(him|usaid)\b|\bwhat\s+does\s+(he|usaid)\s+do\b|\bintroduce\b|\bwho\s+is\s+usaid\s+khan\b/i,
      query: 'who introduction overview software engineer role',
    },
  ];

  function rewriteIntent(question) {
    for (var i = 0; i < INTENT_REWRITES.length; i++) {
      if (INTENT_REWRITES[i].test.test(question)) return question + ' ' + INTENT_REWRITES[i].query;
    }
    return question;
  }

  /** The string to actually retrieve on for a visitor question. */
  function prepareQuery(question, previousQuestion) {
    return contextualQuery(rewriteIntent(question), previousQuestion);
  }

  var OUT_OF_SCOPE =
    "I can only answer questions about Usaid, and I couldn't find that in his portfolio or resume. " +
    'Try asking about his skills, projects, experience, certifications or education, or email him at usaidk.tech@gmail.com.';

  /* ── Extractive answer ───────────────────────────────────── */

  var MAX_UNITS = 6;          // bullets/sentences quoted from the best chunk
  var SHORT_CHUNK_WORDS = 130; // chunks at or under this are quoted whole

  // Splits a chunk into quotable units: each bullet / numbered line is
  // one unit, and prose paragraphs are split into sentences.
  function splitUnits(text) {
    var units = [];
    text.split('\n').forEach(function (line) {
      line = line.trim();
      if (!line) return;
      if (/^(-|\d+\.)\s+/.test(line)) {
        units.push({ text: line.replace(/^(-|\d+\.)\s+/, ''), bullet: true });
        return;
      }
      // Sentence boundary = terminal punctuation followed by a capital;
      // avoids breaking on "Pvt. Ltd.", "B.Sc. (CS)" and version numbers.
      line.split(/(?<=[.!?])\s+(?=[A-Z"])/).forEach(function (sentence) {
        if (sentence.trim()) units.push({ text: sentence.trim(), bullet: false });
      });
    });
    return units;
  }

  function scoreUnit(index, unitText, weights) {
    var terms = unique(tokenize(unitText));
    var score = 0;
    for (var i = 0; i < terms.length; i++) {
      if (weights[terms[i]]) score += weights[terms[i]] * (index.idf[terms[i]] || 0);
    }
    return score;
  }

  function wordCount(text) { return text.split(/\s+/).length; }

  function render(units) {
    var out = [];
    units.forEach(function (unit, i) {
      if (unit.bullet) {
        out.push((i && !units[i - 1].bullet ? '\n' : '') + '- ' + unit.text);
      } else if (i && !units[i - 1].bullet) {
        out[out.length - 1] += ' ' + unit.text;
      } else {
        out.push((i ? '\n' : '') + unit.text);
      }
    });
    return out.join('\n');
  }

  /**
   * Composes an answer straight from retrieved chunks, with no language
   * model: quote the best chunk (whole if short, otherwise its lead
   * sentence plus the units that best match the question).
   * Used when no LLM is configured, when the LLM call fails, and in the
   * browser when the API is unreachable.
   */
  function composeAnswer(index, query, hits) {
    if (!hits || !hits.length) return OUT_OF_SCOPE;

    var weights = buildQueryTerms(query).weights;
    var best = hits[0].chunk;
    if (wordCount(best.text) <= SHORT_CHUNK_WORDS) return best.text;

    var units = splitUnits(best.text);
    var scored = units.map(function (unit, i) {
      return { unit: unit, i: i, score: scoreUnit(index, unit.text, weights) };
    });

    // Always keep the lead sentence: it names the subject, so the bullets
    // that follow make sense out of context.
    var keep = Object.create(null);
    keep[0] = true;
    var matching = scored.filter(function (s) { return s.i > 0 && s.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.i - b.i; })
      .slice(0, MAX_UNITS - 1);

    // Nothing in the body matched specifically (the hit came from the
    // title/tags, e.g. a broad "tell me about X"): the whole chunk is the
    // answer, and cherry-picking lines would only truncate it arbitrarily.
    if (matching.length < 2) return best.text;
    matching.forEach(function (s) { keep[s.i] = true; });

    return render(units.filter(function (_, i) { return keep[i]; }));
  }

  /**
   * End-to-end retrieval-only answer: small talk -> search -> compose.
   * Returns { answer, sources, confident }.
   */
  function answer(index, question, previousQuestion) {
    var chat = smallTalk(question);
    if (chat) return { answer: chat, sources: [], confident: true };

    var result = search(index, prepareQuery(question, previousQuestion));
    if (!result.confident) return { answer: OUT_OF_SCOPE, sources: [], confident: false };

    return {
      answer: composeAnswer(index, question, result.hits),
      sources: toSources(result.hits),
      confident: true,
    };
  }

  // Public shape of a citation: enough for the UI to label a chip and
  // link to the page section, without shipping the chunk text twice.
  function toSources(hits, limit) {
    // Only cite chunks that carried real weight; a distant runner-up
    // shown as a "source" would misrepresent where the answer came from.
    var floor = hits.length ? hits[0].score * 0.6 : 0;
    return hits.filter(function (hit) { return hit.score >= floor; }).slice(0, limit || 3).map(function (hit) {
      return { id: hit.chunk.id, title: hit.chunk.title, section: hit.chunk.section };
    });
  }

  return {
    tokenize: tokenize,
    normalize: normalize,
    stem: stem,
    buildQueryTerms: buildQueryTerms,
    createIndex: createIndex,
    search: search,
    contextualQuery: contextualQuery,
    prepareQuery: prepareQuery,
    smallTalk: smallTalk,
    composeAnswer: composeAnswer,
    answer: answer,
    toSources: toSources,
    OUT_OF_SCOPE: OUT_OF_SCOPE,
  };
}));
