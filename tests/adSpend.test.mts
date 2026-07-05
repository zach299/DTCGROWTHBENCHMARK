import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateMonthlySpend, revenueMidM, formatSpend } from '../lib/adSpend.ts';

test('no paid activity returns null', () => {
  assert.equal(estimateMonthlySpend({ metaAds: 0 }), null);
});

test('catalog-heavy mega-advertiser stays in a sane band', () => {
  const r = estimateMonthlySpend({
    metaAds: 2796, qualityAdjustedAds: 900, revenueRange: '$100M-$250M',
    paidIntensity: 'high', creativeDiversityScore: 20, landingPages: 8,
  });
  assert.ok(r);
  assert.ok(r.high <= 1_500_000, `high ${r.high} should be <= $1.5M`);
  assert.ok(r.low >= 50_000, `low ${r.low} should be >= $50k`);
  assert.equal(r.confidence, 'high');
});

test('diminishing returns: 10x ads is far less than 10x spend', () => {
  const small = estimateMonthlySpend({ metaAds: 50, qualityAdjustedAds: 50, revenueRange: '$10M-$50M', paidIntensity: 'medium' });
  const big = estimateMonthlySpend({ metaAds: 500, qualityAdjustedAds: 500, revenueRange: '$10M-$50M', paidIntensity: 'medium' });
  assert.ok(small && big);
  assert.ok(big.high / small.high < 5, 'spend should scale sublinearly with ad count');
});

test('revenue cap holds: spend never exceeds 20% of revenue / 12', () => {
  const r = estimateMonthlySpend({ metaAds: 5000, qualityAdjustedAds: 5000, revenueRange: '$1M-$5M', paidIntensity: 'high' });
  assert.ok(r);
  assert.ok(r.high <= ((3_000_000 * 0.2) / 12) * 1.7, `high ${r.high} vs cap`);
});

test('ads-only estimate is low confidence with wide band', () => {
  const r = estimateMonthlySpend({ metaAds: 60, qualityAdjustedAds: 40, paidIntensity: 'medium' });
  assert.ok(r);
  assert.equal(r.confidence, 'low');
  assert.ok(r.high / r.low >= 3, 'ads-only band should be wide');
});

test('label formats as a range', () => {
  const r = estimateMonthlySpend({ metaAds: 30, revenueRange: '$10M-$50M', paidIntensity: 'medium' });
  assert.ok(r && / – /.test(r.label));
});

test('revenueMidM parses common formats', () => {
  assert.equal(revenueMidM('$10M-$50M'), 30);
  assert.equal(revenueMidM('$250M+'), 250);
  assert.equal(revenueMidM(null), null);
});

test('formatSpend', () => {
  assert.equal(formatSpend(250_000), '$250k');
  assert.equal(formatSpend(1_500_000), '$1.5M');
});

// ── Edge-case fixture matrix ──
const FIXTURES: [string, Parameters<typeof estimateMonthlySpend>[0], (r: ReturnType<typeof estimateMonthlySpend>) => void][] = [
  ['0 ads → null', { metaAds: 0 }, (r) => assert.equal(r, null)],
  ['1-5 ads → tiny band, low conf', { metaAds: 3, qualityAdjustedAds: 3, revenueRange: '$1M-$5M', paidIntensity: 'low' }, (r) => {
    assert.ok(r); assert.ok(r.high <= 60_000, `high ${r.high}`); assert.equal(r.confidence, 'low');
  }],
  ['50 ads mid-market', { metaAds: 50, qualityAdjustedAds: 45, revenueRange: '$10M-$50M', paidIntensity: 'high' }, (r) => {
    assert.ok(r); assert.ok(r.low >= 20_000 && r.high <= 600_000, `${r.label}`);
  }],
  ['500+ ads', { metaAds: 550, qualityAdjustedAds: 400, revenueRange: '$50M-$100M', paidIntensity: 'high' }, (r) => {
    assert.ok(r); assert.ok(r.high <= 2_000_000, `${r.label}`); assert.equal(r.basis, 'blended');
  }],
  ['2,000+ catalog-heavy', { metaAds: 2400, qualityAdjustedAds: 700, revenueRange: '$100M-$250M', paidIntensity: 'high', creativeDiversityScore: 15 }, (r) => {
    assert.ok(r); assert.ok(r.high <= 1_500_000, `${r.label}`);
    assert.ok(r.explanation.some((e) => e.includes('catalog')), 'explains catalog discount');
  }],
  ['high revenue, low ads', { metaAds: 8, qualityAdjustedAds: 8, revenueRange: '$250M+', paidIntensity: 'low' }, (r) => {
    assert.ok(r); assert.ok(r.high <= 800_000, `${r.label} should not balloon to revenue scale`);
  }],
  ['low revenue, high ads → revenue cap wins', { metaAds: 900, qualityAdjustedAds: 800, revenueRange: '$1M-$5M', paidIntensity: 'high' }, (r) => {
    assert.ok(r); assert.ok(r.high <= ((3_000_000 * 0.2) / 12) * 1.7, `${r.label}`);
    assert.ok(r.explanation.some((e) => e.includes('capped')), 'explains the cap');
  }],
];

for (const [name, input, check] of FIXTURES) {
  test(`fixture: ${name}`, () => check(estimateMonthlySpend(input)));
}

test('every estimate carries basis + non-empty explanation', () => {
  const r = estimateMonthlySpend({ metaAds: 40, revenueRange: '$10M-$50M', paidIntensity: 'medium' });
  assert.ok(r);
  assert.ok(['blended', 'ads_only'].includes(r.basis));
  assert.ok(r.explanation.length >= 2);
});
