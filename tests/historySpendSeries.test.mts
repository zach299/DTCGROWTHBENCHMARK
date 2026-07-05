// Regression: the Growth Over Time chart computes its "Est. Monthly Spend"
// series per snapshot via estimateMonthlySpend using ONLY snapshot fields
// (meta/google/linkedin ad counts + landing pages). These pin the behavior
// that series construction relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateMonthlySpend } from '../lib/adSpend.ts';

function snapshotMidpoint(s: {
  active_meta_ads: number | null;
  active_google_ads?: number | null;
  active_linkedin_ads?: number | null;
  landing_pages_count?: number | null;
}): number | null {
  const est = estimateMonthlySpend({
    metaAds: Number(s.active_meta_ads ?? 0),
    googleAds: s.active_google_ads != null ? Number(s.active_google_ads) : null,
    linkedinAds: s.active_linkedin_ads != null ? Number(s.active_linkedin_ads) : null,
    landingPages: s.landing_pages_count != null ? Number(s.landing_pages_count) : null,
  });
  return est ? (est.low + est.high) / 2 : null;
}

test('snapshot with zero ads yields null (dropped from spend series)', () => {
  assert.equal(snapshotMidpoint({ active_meta_ads: 0 }), null);
  assert.equal(snapshotMidpoint({ active_meta_ads: null }), null);
});

test('snapshot with ads yields a finite positive midpoint', () => {
  const v = snapshotMidpoint({ active_meta_ads: 40, active_google_ads: 10, landing_pages_count: 6 });
  assert.ok(v != null && Number.isFinite(v) && v > 0, `midpoint ${v}`);
});

test('midpoint grows monotonically with ad volume across snapshots', () => {
  const a = snapshotMidpoint({ active_meta_ads: 10 });
  const b = snapshotMidpoint({ active_meta_ads: 100 });
  const c = snapshotMidpoint({ active_meta_ads: 500 });
  assert.ok(a != null && b != null && c != null);
  assert.ok(a < b && b < c, `expected ${a} < ${b} < ${c}`);
});
