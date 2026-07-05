import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTamQuery, describeFilters } from '../lib/tamQuery.ts';
import { buildReason, buildOutboundAngle } from '../lib/reason.ts';

test('parses the flagship prompt', () => {
  const f = parseTamQuery('Find fastest-growing Shopify beauty brands doing $10M–$100M in revenue');
  assert.equal(f.category, 'beauty');
  assert.equal(f.platform, 'shopify');
  assert.equal(f.revenueMinM, 10);
  assert.equal(f.revenueMaxM, 100);
  assert.ok(f.momentum && f.momentum.length > 0);
  assert.equal(f.sort, 'growth');
});

test('parses monthly spend floor', () => {
  const f = parseTamQuery('Build a TAM list of ecommerce brands spending $100k+/mo on paid social');
  assert.equal(f.spendMinMo, 100_000);
});

test('high ad spend keyword implies spend floor', () => {
  const f = parseTamQuery('beauty brands with high ad spend');
  assert.equal(f.category, 'beauty');
  assert.equal(f.spendMinMo, 100_000);
});

test('meta scaling implies meta ads floor and momentum', () => {
  const f = parseTamQuery('Show me apparel brands scaling Meta ads this month');
  assert.equal(f.category, 'apparel');
  assert.ok((f.metaAdsMin ?? 0) >= 25);
});

test('empty/garbage query returns default sort only, never throws', () => {
  for (const q of ['', '   ', '???!!!', '$$$$', 'zzzzzz qqqq']) {
    const f = parseTamQuery(q);
    assert.equal(f.sort, 'growth');
  }
});

test('top 1% and newly enriched flags', () => {
  const f = parseTamQuery('home goods brands entering top 1%, newly enriched');
  assert.equal(f.top1pct, true);
  assert.equal(f.newlyEnriched, true);
});

test('describeFilters produces readable chips', () => {
  const parts = describeFilters({ category: 'beauty', spendMinMo: 100_000, sort: 'growth' });
  assert.ok(parts.some((p) => p.includes('beauty')));
  assert.ok(parts.some((p) => p.includes('$100k')));
});

test('buildReason never returns empty and handles nulls', () => {
  assert.ok(buildReason({}).length > 0);
  const r = buildReason({ metaAds: 118, realCreativeScore: 67, momentum: 'Accelerating', spend: { low: 300_000, high: 650_000, label: '$300k – $650k', confidence: 'medium', basis: 'blended', explanation: [] } });
  assert.ok(r.includes('118') || r.toLowerCase().includes('meta'));
  assert.ok(r.endsWith('.'));
});

test('buildOutboundAngle adapts to signal strength', () => {
  const big = buildOutboundAngle('Gymshark', { metaAds: 200 });
  const none = buildOutboundAngle('TinyBrand', { metaAds: 0, momentum: 'Emerging' });
  assert.ok(big.includes('Gymshark') && big.includes('200'));
  assert.ok(none.includes('TinyBrand') && !none.includes('0 active'));
});
