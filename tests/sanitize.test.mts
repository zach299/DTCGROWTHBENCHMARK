import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeIlike } from '../lib/utils/sanitize.ts';

test('escapes LIKE wildcards', () => {
  assert.equal(escapeIlike('100%_done'), '100\\%\\_done');
});
test('strips PostgREST grammar chars', () => {
  assert.equal(escapeIlike('a,b(c)d*e'), 'abcde');
});
test('escapes backslashes before wildcards', () => {
  assert.equal(escapeIlike('a\\%'), 'a\\\\\\%');
});
test('caps length and lowercases', () => {
  assert.equal(escapeIlike('A'.repeat(300)).length, 100);
  assert.equal(escapeIlike('RIDGE.com'), 'ridge.com');
});
test('injection-ish inputs become inert', () => {
  for (const evil of ['%,domain.eq.x', ')(or.eq.1', '*,*', '__%__']) {
    const out = escapeIlike(evil);
    assert.ok(!out.includes(',') && !out.includes('(') && !out.includes(')') && !out.includes('*'));
  }
});
test('empty and whitespace input', () => {
  assert.equal(escapeIlike('   '), '');
});
