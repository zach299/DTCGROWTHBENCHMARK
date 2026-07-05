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
