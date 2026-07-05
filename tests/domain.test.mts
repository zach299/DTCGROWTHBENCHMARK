import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, domainCandidates } from '../lib/utils/domain.ts';

test('normalizeDomain canonicalizes all common forms', () => {
  for (const input of [
    'ruggable.com', 'RUGGABLE.COM', 'www.ruggable.com', 'https://ruggable.com',
    'http://www.ruggable.com', 'https://ruggable.com/', 'https://www.ruggable.com/pages/about?x=1#top',
    '  ruggable.com  ',
  ]) {
    assert.equal(normalizeDomain(input), 'ruggable.com', `input: ${input}`);
  }
});

test('normalizeDomain keeps subdomains other than www', () => {
  assert.equal(normalizeDomain('https://shop.gymshark.com/us'), 'shop.gymshark.com');
});

test('domainCandidates covers stored variants and always includes the bare form', () => {
  const c = domainCandidates('https://www.ruggable.com/');
  assert.ok(c.includes('ruggable.com'));
  assert.ok(c.includes('www.ruggable.com'));
  assert.ok(c.includes('https://ruggable.com'));
  assert.ok(c.includes('https://www.ruggable.com/'));
});

test('normalizeDomain on garbage does not throw', () => {
  for (const junk of ['', '   ', '???', 'http://', '//..//']) {
    assert.doesNotThrow(() => normalizeDomain(junk));
  }
});
