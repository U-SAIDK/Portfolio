'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { knowledge, ROOT } = require('./helpers');

test('knowledge.json is in sync with knowledge/*.md', () => {
  // Throws (non-zero exit) when someone edits a doc without rebuilding.
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-knowledge.js'), '--check'], { stdio: 'pipe' });
});

test('every chunk has the fields the engine and UI rely on', () => {
  assert.ok(knowledge.chunks.length >= 30);
  for (const chunk of knowledge.chunks) {
    assert.match(chunk.id, /^[a-z0-9-]+$/);
    assert.ok(chunk.title.length > 3, `${chunk.id}: title`);
    assert.ok(chunk.text.length > 80, `${chunk.id}: text`);
    assert.ok(chunk.tags.length >= 3, `${chunk.id}: tags`);
  }
});

test('chunk ids are unique', () => {
  const ids = knowledge.chunks.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every chunk section is a real anchor on the page', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  for (const chunk of knowledge.chunks) {
    assert.ok(html.includes(`<section id="${chunk.section}"`), `${chunk.id}: no <section id="${chunk.section}">`);
  }
});

test('the corpus does not contradict itself on key facts', () => {
  const all = knowledge.chunks.map((c) => c.text).join('\n');
  const emails = new Set(all.match(/[\w.]+@[\w.]+\.\w+/g));
  assert.deepEqual([...emails], ['usaidk.tech@gmail.com']);
  const cgpas = new Set(all.match(/CGPA of [\d.]+/g));
  assert.equal(cgpas.size, 1);
});
