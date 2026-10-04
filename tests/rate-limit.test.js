'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../shared/rate-limit');

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('allows up to the limit, then blocks with a retry hint', () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: clock.now });

  assert.deepEqual(limiter.check('ip').remaining, 2);
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, true);

  const blocked = limiter.check('ip');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSec, 60);
});

test('the window slides: old hits expire individually', () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: clock.now });

  limiter.check('ip');
  clock.advance(6_000);
  limiter.check('ip');
  assert.equal(limiter.check('ip').allowed, false);

  clock.advance(4_001); // first hit is now outside the window
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, false);
});

test('blocked attempts do not extend the lockout', () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: clock.now });

  limiter.check('ip');
  for (let i = 0; i < 5; i++) {
    clock.advance(1_000);
    assert.equal(limiter.check('ip').allowed, false);
  }
  clock.advance(5_001);
  assert.equal(limiter.check('ip').allowed, true);
});

test('keys are independent', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
  assert.equal(limiter.check('b').allowed, true);
});

test('reset clears all state', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  limiter.check('a');
  limiter.reset();
  assert.equal(limiter.check('a').allowed, true);
});
