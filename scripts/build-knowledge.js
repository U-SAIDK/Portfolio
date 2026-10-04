#!/usr/bin/env node
/**
 * Compiles knowledge/*.md into public/assets/data/knowledge.json — the
 * single corpus that both the browser (offline fallback) and the
 * /api/chat function (shared/chat-handler.js) retrieve from.
 *
 * Deliberately dependency-free: the frontmatter is a flat `key: value`
 * block, so a YAML parser would be overkill.
 *
 *   node scripts/build-knowledge.js          write the JSON
 *   node scripts/build-knowledge.js --check  exit 1 if the JSON is stale
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'knowledge');
const OUT_FILE = path.join(__dirname, '..', 'public', 'assets', 'data', 'knowledge.json');

const REQUIRED_KEYS = ['title', 'section', 'source', 'tags'];
const KNOWN_SECTIONS = ['hero', 'about', 'skills', 'projects', 'experience', 'resume', 'certifications', 'education', 'contact'];
// Chunks far outside this range retrieve badly: too short carries no
// answer, too long dilutes BM25 and bloats the prompt.
const MIN_WORDS = 20;
const MAX_WORDS = 260;

function parseDocument(file) {
  const raw = fs.readFileSync(path.join(SRC_DIR, file), 'utf8').replace(/\r\n/g, '\n');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing frontmatter block`);

  const meta = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) throw new Error(`${file}: bad frontmatter line "${line}"`);
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  for (const key of REQUIRED_KEYS) {
    if (!meta[key]) throw new Error(`${file}: frontmatter is missing "${key}"`);
  }
  if (!KNOWN_SECTIONS.includes(meta.section)) {
    throw new Error(`${file}: unknown section "${meta.section}" (expected one of ${KNOWN_SECTIONS.join(', ')})`);
  }

  const text = match[2].trim().replace(/\n{3,}/g, '\n\n');
  const words = text.split(/\s+/).length;
  if (words < MIN_WORDS || words > MAX_WORDS) {
    throw new Error(`${file}: body is ${words} words (keep it between ${MIN_WORDS} and ${MAX_WORDS})`);
  }

  return {
    // Strip the ordering prefix: "31-project-therapycrm.md" -> "project-therapycrm"
    id: file.replace(/\.md$/, '').replace(/^\d+-/, ''),
    title: meta.title,
    section: meta.section,
    source: meta.source,
    tags: meta.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    text,
  };
}

function build() {
  const files = fs.readdirSync(SRC_DIR)
    .filter((f) => /^\d+-.*\.md$/.test(f))
    .sort();
  if (!files.length) throw new Error(`no knowledge documents found in ${SRC_DIR}`);

  const chunks = files.map(parseDocument);

  const seen = new Set();
  for (const chunk of chunks) {
    if (seen.has(chunk.id)) throw new Error(`duplicate chunk id "${chunk.id}"`);
    seen.add(chunk.id);
  }

  // No timestamp on purpose: the output must be byte-identical for
  // identical input so `--check` (and git diffs) stay meaningful.
  return JSON.stringify({ version: 1, chunks }, null, 2) + '\n';
}

function main() {
  const output = build();
  const count = JSON.parse(output).chunks.length;

  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== output) {
      console.error('knowledge.json is out of date — run `npm run build:knowledge`.');
      process.exit(1);
    }
    console.log(`knowledge.json is up to date (${count} chunks).`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, output);
  console.log(`Wrote ${count} chunks to ${path.relative(process.cwd(), OUT_FILE)}`);
}

try {
  main();
} catch (err) {
  console.error(`build-knowledge: ${err.message}`);
  process.exit(1);
}
