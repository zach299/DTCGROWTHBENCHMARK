import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonaReason, buildPersonaTakeaways, isPersona } from '../lib/persona.ts';
import { buildSignalCategories } from '../lib/signals.ts';

const rich = {
  metaAds: 118, metaChangePct: 22, realCreativeScore: 67, dpaShare: 0.1,
  momentum: 'Accelerating', growthScore: 88, landingPages: 12,
  spend: { low: 60_000_000, high: 96_000_000, label: '$60M – $96M', monthly_low: 5_000_000, monthly_high: 8_000_000, confidence: 'high' as const, basis: 'revenue_pct' as const, pct_of_revenue: 0.31, explanation: [] },
};

test('personas draw different conclusions from the same signals', () => {
  const agency = buildPersonaReason('agency', rich);
  const tpl = buildPersonaReason('3pl', rich);
  const saas = buildPersonaReason('dtc_saas', rich);
  assert.notEqual(agency, tpl);
  assert.notEqual(tpl, saas);
  assert.ok(/creative/i.test(agency), `agency lens mentions creative: ${agency}`);
  assert.ok(/order|fulfill|demand|catalog/i.test(tpl), `3pl lens mentions ops: ${tpl}`);
  assert.ok(/tool|stack|CAC|vendor|efficiency/i.test(saas), `saas lens mentions stack/CAC: ${saas}`);
});

test('thin signals fall back to neutral reason, never empty', () => {
  for (const p of ['agency', '3pl', 'dtc_saas', 'other'] as const) {
    const r = buildPersonaReason(p, { metaAds: 0, momentum: null });
    assert.ok(r.length > 0, `${p} reason non-empty`);
  }
});

test('takeaways are 1-3 bullets and persona-flavored', () => {
  const t = buildPersonaTakeaways('3pl', rich);
  assert.ok(t.length >= 1 && t.length <= 3);
  assert.ok(t.some((x) => /fulfillment|SKU|order/i.test(x)), t.join(' | '));
  const empty = buildPersonaTakeaways('agency', { metaAds: 0 });
  assert.ok(empty.length >= 1, 'never empty');
});

test('isPersona validates', () => {
  assert.ok(isPersona('3pl'));
  assert.ok(!isPersona('hacker'));
});

test('signal grid: paid media live with metrics, 5 coming-soon categories', () => {
  const cats = buildSignalCategories({ active_meta_ads: 118, real_creative_score: 67, ad_activity_level: 'high', landing_pages: ['a','b'], spend_label: '$60M – $96M' });
  assert.equal(cats.length, 6);
  const paid = cats.find((c) => c.key === 'paid_media')!;
  assert.equal(paid.status, 'live');
  assert.ok(paid.metrics.length >= 3);
  assert.ok(paid.metrics.some((m) => m.label === 'Growth Investment Intensity'));
  assert.equal(cats.filter((c) => c.status === 'coming_soon').length, 5);
});

test('signal grid with zero ad data still renders sanely', () => {
  const cats = buildSignalCategories({});
  const paid = cats.find((c) => c.key === 'paid_media')!;
  assert.ok(paid.metrics.some((m) => m.value === 'None'));
});
