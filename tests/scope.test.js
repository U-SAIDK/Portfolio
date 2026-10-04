'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RAG, index, topId } = require('./helpers');

const OFF_TOPIC = [
  'What is the capital of France?',
  'Write me a poem about cats',
  'how to cook biryani',
  "what's the weather today",
  'who is elon musk',
  'What is 2+2?',
  'asdfgh qwerty',
  '',
  '???',
];

for (const question of OFF_TOPIC) {
  test(`treats as out of scope: ${JSON.stringify(question)}`, () => {
    assert.equal(topId(question), null);
  });
}

test('out-of-scope questions get the canned reply and no sources', () => {
  const result = RAG.answer(index, 'What is the capital of France?');
  assert.equal(result.confident, false);
  assert.equal(result.answer, RAG.OUT_OF_SCOPE);
  assert.deepEqual(result.sources, []);
});

test('an out-of-scope search returns no hits to feed a prompt', () => {
  const result = RAG.search(index, 'best pizza in naples');
  assert.equal(result.confident, false);
  assert.deepEqual(result.hits, []);
});

test('greetings and thanks are answered without retrieval', () => {
  for (const greeting of ['hi', 'Hello!', 'hey', 'good morning']) {
    const result = RAG.answer(index, greeting);
    assert.match(result.answer, /portfolio assistant/);
    assert.deepEqual(result.sources, []);
  }
  assert.match(RAG.answer(index, 'thanks!').answer, /welcome/i);
});

test('a greeting followed by a real question is not swallowed as small talk', () => {
  assert.equal(RAG.smallTalk('hi, what is his email?'), null);
});
