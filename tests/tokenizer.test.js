'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RAG } = require('./helpers');

test('drops stopwords and the subject\'s own name', () => {
  assert.deepEqual(RAG.tokenize('What is the email of Usaid Khan?'), ['email']);
});

test('normalises punctuation-heavy tech terms to one token', () => {
  assert.deepEqual(RAG.tokenize('CI/CD'), ['cicd']);
  assert.deepEqual(RAG.tokenize('Next.js and Node.js'), ['nextjs', 'nodejs']);
  assert.deepEqual(RAG.tokenize('k8s'), ['kubernetes']);
  assert.deepEqual(RAG.tokenize('full-stack front end'), ['fullstack', 'frontend']);
});

test('"Spring Boot" stays matchable as both the product and the framework', () => {
  assert.deepEqual(RAG.tokenize('Spring Boot'), ['springboot', 'spring']);
});

test('stems plurals and verb endings to the same root', () => {
  assert.equal(RAG.stem('projects'), 'project');
  assert.equal(RAG.stem('certifications'), 'certification');
  assert.equal(RAG.stem('technologies'), 'technology');
  assert.equal(RAG.stem('deployed'), RAG.stem('deploying'));
});

test('does not mangle tech names that merely end in a suffix', () => {
  for (const word of ['aws', 'kubernetes', 'jenkins', 'devops', 'gitops', 'spring', 'css', 'ios']) {
    assert.equal(RAG.stem(word), word);
  }
});

test('keeps "c" (the language) and version digits, drops other lone letters', () => {
  assert.deepEqual(RAG.tokenize('C and JUnit 5'), ['c', 'junit', '5']);
  assert.deepEqual(RAG.tokenize("Usaid's"), []);
});

test('synonym expansions are weighted below typed terms', () => {
  const { weights, typed } = RAG.buildQueryTerms('download cv');
  assert.deepEqual(typed, ['download', 'cv']);
  assert.equal(weights.cv, 1);
  assert.ok(weights.resume > 0 && weights.resume < 1);
});

test('tolerates null and non-string input', () => {
  assert.deepEqual(RAG.tokenize(null), []);
  assert.deepEqual(RAG.tokenize(undefined), []);
  assert.deepEqual(RAG.tokenize(42), ['42']);
});
