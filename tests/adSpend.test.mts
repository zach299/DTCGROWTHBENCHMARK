import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateAdSpend, revenueMidM, formatSpend } from '../lib/adSpend.ts';

test('no paid activity returns null', () => {
  assert.equal(estimateAdSpend({ metaAds: 0 }), null);
});

test('Ruggable-class brand lands in the ~$60-110M annual band', () => {
  const r = estimateAdSpend({
    metaAds: 435, qualityAdjustedAds: 380, revenueRange: '$250M+',
    paidIntensity: 'high', momentum: 'Exploding', creativeDiversityScore: 45, landingPages: 12,
  });
  assert.ok(r);
  assert.ok(r.low >= 40_000_000 && r.low <= 80_000_000, `low ${r.low}`);
  assert.ok(r.high >= 70_000_000 && r.high <= 120_000_000, `high ${r.high}`);
  assert.equal(r.basis, 'revenue_pct');
  assert.equal(r.confidence, 'high');
  assert.ok(r.pct_of_revenue != null && r.pct_of_revenue >= 0.2 && r.pct_of_revenue <= 0.4);
});

test('more ads per $M revenue → higher share of the 20-40% range', () => {
  const light = estimateAdSpend({ metaAds: 30, revenueRange: '$100M-$250M', paidIntensity: 'high' });
  const heavy = estimateAdSpend({ metaAds: 900, revenueRange: '$100M-$250M', paidIntensity: 'high' });
  assert.ok(light && heavy);
  assert.ok((heavy.pct_of_revenue ?? 0) > (light.pct_of_revenue ?? 1) - 1e9, 'both defined');
  assert.ok(heavy.high > light.high, 'heavier ad load implies bigger budget');
});

test('pct of revenue never exceeds 40%', () => {
  const r = estimateAdSpend({ metaAds: 5000, qualityAdjustedAds: 5000, revenueRange: '$1M-$5M', paidIntensity: 'high', momentum: 'Exploding' });
  assert.ok(r && r.pct_of_revenue != null);
  assert.ok(r.pct_of_revenue <= 0.4, `pct ${r.pct_of_revenue}`);
});

test('mega-revenue brand with a handful of ads gets ad-volume capped', () => {
  const r = estimateAdSpend({ metaAds: 8, qualityAdjustedAds: 8, revenueRange: '$250M+', paidIntensity: 'low' });
  assert.ok(r);
  assert.ok(r.high <= 8 * 20_000 * 12 * 1.25 + 1_000_000, `high ${r.high} should be per-ad capped`);
  assert.ok(r.explanation.some((e) => e.includes('capped by ad volume')));
});

test('ads-only estimate: annual, wide band, low confidence, monthly fields consistent', () => {
  const r = estimateAdSpend({ metaAds: 60, qualityAdjustedAds: 40, paidIntensity: 'medium' });
  assert.ok(r);
  assert.equal(r.basis, 'ads_only');
  assert.equal(r.confidence, 'low');
  assert.ok(r.high / r.low >= 3, 'wide band');
  assert.equal(r.monthly_low, Math.round(r.low / 12));
  assert.equal(r.monthly_high, Math.round(r.high / 12));
});

test('catalog-heavy advertiser explains the discount', () => {
  const r = estimateAdSpend({
    metaAds: 2400, qualityAdjustedAds: 700, revenueRange: '$100M-$250M',
    paidIntensity: 'high', creativeDiversityScore: 15,
  });
  assert.ok(r);
  assert.ok(r.explanation.some((e) => e.includes('catalog')));
  assert.ok(r.high <= 120_000_000, `high ${r.high}`);
});

test('every estimate carries basis + explanation', () => {
  const r = estimateAdSpend({ metaAds: 40, revenueRange: '$10M-$50M', paidIntensity: 'medium' });
  assert.ok(r);
  assert.ok(r.explanation.length >= 2);
  assert.ok(/ – /.test(r.label));
});

test('revenueMidM parses common formats', () => {
  assert.equal(revenueMidM('$10M-$50M'), 30);
  assert.equal(revenueMidM('$250M+'), 250);
  assert.equal(revenueMidM(null), null);
});

test('formatSpend handles k and M', () => {
  assert.equal(formatSpend(250_000), '$250k');
  assert.equal(formatSpend(75_000_000), '$75M');
});
