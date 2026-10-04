'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RAG, index } = require('./helpers');

const ask = (question, previous) => RAG.answer(index, question, previous);

test('factual answers contain the fact', () => {
  assert.match(ask('What is his email?').answer, /usaidk\.tech@gmail\.com/);
  assert.match(ask('What is his CGPA?').answer, /8\.28/);
  assert.match(ask('Where did he study?').answer, /Savitribai Phule Pune University/);
  assert.match(ask('Where does he work?').answer, /Data Innovations Technologies/);
});

test('short chunks are quoted whole', () => {
  const result = ask('Tell me about TherapyCRM');
  assert.match(result.answer, /healthcare CRM/);
  assert.match(result.answer, /Tech stack:/);
});

test('long chunks are trimmed to the lead plus the matching bullets', () => {
  const result = ask('what did he fix in the fintech platform regarding pagination?');
  const full = index.docs.find((d) => d.chunk.id === 'experience-fintech').chunk.text;
  assert.ok(result.answer.length < full.length, 'answer should be shorter than the chunk');
  assert.match(result.answer, /^As a Software Development Engineer/);
  assert.match(result.answer, /pagination defect across 39/);
});

test('sources are capped, deduplicated and carry a page section', () => {
  const { sources } = ask('Does he know Kubernetes?');
  assert.ok(sources.length >= 1 && sources.length <= 3);
  assert.equal(new Set(sources.map((s) => s.id)).size, sources.length);
  for (const source of sources) {
    assert.ok(source.title && source.section);
    assert.equal(source.text, undefined, 'chunk text must not be shipped in sources');
  }
});

test('answers never leak frontmatter or markdown headings', () => {
  for (const question of ['skills', 'projects', 'certifications', 'education', 'contact']) {
    const { answer } = ask(question);
    assert.doesNotMatch(answer, /^---|^title:|^#/m);
  }
});
