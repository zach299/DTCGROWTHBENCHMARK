import { test } from 'node:test';
import assert from 'node:assert/strict';
// buildTrend & valueAt are module-private; test via getTrends with a stubbed client.
import { getTrends, getTimeline } from '../lib/trends.ts';

function stubSupabase(rows: unknown[]) {
  const result = { data: rows, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    chain[m] = () => chain;
  }
  // Make the chain awaitable like supabase's thenable builder.
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
  return { from: () => chain } as never;
}

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

test('getTrends with zero snapshots yields tracking labels, no crash', async () => {
  const t = await getTrends(stubSupabase([]), 'ruggable.com', {
    active_meta_ads: 100, landing_pages_count: 5, growth_score: 80,
  });
  assert.equal(t.growth_score.previous, null);
  assert.equal(t.growth_score.label, 'tracking');
});

test('getTrends computes change vs snapshot ~30d ago', async () => {
  const rows = [
    { snapshot_date: day(1), active_meta_ads: 120, landing_pages_count: 6, growth_score: 85 },
    { snapshot_date: day(31), active_meta_ads: 100, landing_pages_count: 5, growth_score: 80 },
  ];
  const t = await getTrends(stubSupabase(rows), 'ruggable.com', {
    active_meta_ads: 130, landing_pages_count: 7, growth_score: 90,
  });
  const m30 = t.active_meta_ads.find((x) => x.window_days === 30);
  assert.ok(m30 && m30.previous === 100, `expected 30d prev 100, got ${m30?.previous}`);
  assert.equal(m30!.change_pct, 30);
  assert.equal(m30!.direction, 'up');
});

test('getTimeline computes per-entry percent change and handles single row', async () => {
  const one = await getTimeline(stubSupabase([
    { snapshot_date: day(0), active_meta_ads: 50, active_google_ads: 0, active_linkedin_ads: 0, landing_pages_count: 2, growth_score: 40, growth_momentum: 'Scaling' },
  ]), 'x.com');
  assert.equal(one.length, 1);
  assert.equal(one[0].meta_change_pct, null);
});
