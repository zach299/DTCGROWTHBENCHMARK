#!/usr/bin/env node
// Durable 50k enrichment worker.
//
// Queries Supabase directly for the next batch of un-enriched or stale domains,
// calls the deployed /api/enrich-meta for each one, saves results, and loops
// until the target count is reached or nothing remains.
//
// Safe to stop and restart at any time — it always skips domains that already
// have a recent last_enriched_at. Zero-ad results are treated as success.
//
// Usage:
//   node scripts/worker.mjs [batch_per_loop] [max_total]
//   CONCURRENCY=5 node scripts/worker.mjs 200 50000
//
// Env vars (reads .env.local if present):
//   NEXT_PUBLIC_SUPABASE_URL        required
//   SUPABASE_SERVICE_ROLE_KEY       required
//   GROWTH_SIGNALS_API_BASE         defaults to https://dtcgrowthbenchmark.vercel.app
//   CONCURRENCY                     default 3
//   SKIP_DAYS                       default 30 (domains enriched within this window are skipped)
//   MAX_RETRIES                     default 2
//   PAUSE_FILE                      default scripts/.pause (touch this file to pause)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
try {
  const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* env already set */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = (process.env.GROWTH_SIGNALS_API_BASE || 'https://dtcgrowthbenchmark.vercel.app').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const SKIP_DAYS = Number(process.env.SKIP_DAYS || 30);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 2);
const PAUSE_FILE = process.env.PAUSE_FILE || resolve(__dirname, '.pause');
const BATCH = Number(process.argv[2] || process.env.BATCH || 50);
const MAX_TOTAL = Number(process.argv[3] || process.env.MAX_TOTAL || 50000);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  console.error('       Set them in .env.local or as environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── progress tracking ────────────────────────────────────────────────────────
let totalDone = 0;
let totalFailed = 0;
let totalNoAds = 0;
let lastDomain = '';
const recentErrors = [];
const t0 = Date.now();

function log(msg) {
  const elapsed = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`[${new Date().toISOString().slice(11, 19)} +${elapsed}m] ${msg}`);
}

function printProgress() {
  const rate = totalDone / Math.max(1, (Date.now() - t0) / 3600000);
  const remaining = MAX_TOTAL - totalDone;
  const etaH = rate > 0 ? (remaining / rate).toFixed(1) : '?';
  log(
    `Progress: ${totalDone} done / ${totalFailed} failed / ${totalNoAds} no-ads | ` +
    `rate: ${rate.toFixed(0)}/hr | ETA: ${etaH}h | last: ${lastDomain}`
  );
}

// ── pool runner ──────────────────────────────────────────────────────────────
async function runPool(items, concurrency, worker) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await worker(item);
      }
    })
  );
}

// ── enrich one domain ────────────────────────────────────────────────────────
async function enrichOne(row) {
  // Claim the domain immediately so concurrent workers skip it on their next fetch.
  await supabase
    .from('company_meta_signals')
    .upsert(
      { domain: row.domain, last_enriched_at: new Date().toISOString(), source: 'worker' },
      { onConflict: 'domain' }
    );

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/api/enrich-meta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INTERNAL_API_KEY ? { 'x-api-key': process.env.INTERNAL_API_KEY } : {}),
        },
        body: JSON.stringify({
          domain: row.domain,
          facebook_url: row.facebook_url ?? null,
          company_name: row.company_name ?? null,
          source: 'worker-50k',
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = await res.json();

      // ok:false but no error string = domain resolved with zero ads — count as success
      if (data.ok || data.signals) {
        lastDomain = row.domain;
        if ((data.signals?.active_meta_ads ?? 0) === 0) totalNoAds++;
        totalDone++;
        return;
      }

      // Real error — retry
      const msg = data.error || `HTTP ${res.status}`;
      if (attempt === MAX_RETRIES) {
        // Back off the claim so it retries sooner next run (7 days ago)
        const retryAt = new Date(Date.now() - 23 * 86_400_000).toISOString();
        await supabase.from('company_meta_signals').update({ last_enriched_at: retryAt }).eq('domain', row.domain);
        totalFailed++;
        const errEntry = `${row.domain}: ${msg.slice(0, 80)}`;
        recentErrors.push(errEntry);
        if (recentErrors.length > 20) recentErrors.shift();
        console.warn(`  ✗ ${errEntry}`);
        return;
      }
      await sleep(2000 * (attempt + 1));
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        totalFailed++;
        console.warn(`  ✗ ${row.domain}: ${e.message?.slice(0, 80)}`);
        return;
      }
      await sleep(2000 * (attempt + 1));
    }
  }
}

// ── fetch next batch ─────────────────────────────────────────────────────────
async function fetchNextBatch(size) {
  const cutoff = new Date(Date.now() - SKIP_DAYS * 86_400_000).toISOString();

  // Page down the sales-ranked list until we've collected `size` domains that
  // aren't fresh. The top of the list is mostly already enriched, so a single
  // fixed-size fetch would find nothing once the head is covered — keep paging.
  const targets = [];
  const PAGE = 1000;
  const MAX_SCAN = 60000; // don't scan past the top-N cohort we care about

  for (let offset = 0; offset < MAX_SCAN && targets.length < size; offset += PAGE) {
    const { data: candidates, error } = await supabase
      .from('master_database')
      .select('domain, facebook_url, sales_numeric')
      .ilike('platform', '%shopify%')
      .order('sales_numeric', { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE - 1);

    if (error) { log(`DB error fetching candidates: ${error.message}`); break; }
    if (!candidates?.length) break; // end of table

    // Filter out recently enriched (chunk the IN() list to stay under limits)
    const skip = new Set();
    for (let i = 0; i < candidates.length; i += 500) {
      const chunk = candidates.slice(i, i + 500).map((r) => r.domain);
      const { data: recent } = await supabase
        .from('company_meta_signals')
        .select('domain')
        .in('domain', chunk)
        .gte('last_enriched_at', cutoff);
      for (const r of recent ?? []) skip.add(r.domain);
    }

    for (const c of candidates) {
      if (!skip.has(c.domain)) targets.push(c);
      if (targets.length >= size) break;
    }
    if (targets.length < size) log(`  scanned ${offset + candidates.length} ranked domains, found ${targets.length} stale so far…`);
  }

  return targets;
}

// ── progress stats from DB ───────────────────────────────────────────────────
async function getDBStats() {
  const cutoff = new Date(Date.now() - SKIP_DAYS * 86_400_000).toISOString();
  const [totalRes, enrichedRes, freshRes] = await Promise.all([
    supabase.from('master_database').select('domain', { count: 'exact', head: true }).ilike('platform', '%shopify%'),
    supabase.from('company_meta_signals').select('domain', { count: 'exact', head: true }),
    supabase.from('company_meta_signals').select('domain', { count: 'exact', head: true }).gte('last_enriched_at', cutoff),
  ]);
  return {
    total: totalRes.count ?? 0,
    enriched: enrichedRes.count ?? 0,
    fresh: freshRes.count ?? 0,
  };
}

// ── main loop ────────────────────────────────────────────────────────────────
async function main() {
  log(`Worker starting — target: ${MAX_TOTAL} domains | batch: ${BATCH} | concurrency: ${CONCURRENCY}`);
  log(`API: ${API_BASE} | skip if enriched within ${SKIP_DAYS}d`);
  log(`Pause: touch ${PAUSE_FILE} to pause, remove to resume\n`);

  const stats = await getDBStats();
  log(`DB state: ${stats.enriched} enriched ever | ${stats.fresh} fresh | ${stats.total} total brands`);

  let loops = 0;
  let lastProgressLog = Date.now();

  while (totalDone < MAX_TOTAL) {
    // Check pause file
    if (existsSync(PAUSE_FILE)) {
      log('PAUSED — remove scripts/.pause to resume');
      await sleep(10_000);
      continue;
    }

    const batch = await fetchNextBatch(BATCH);

    if (batch.length === 0) {
      log('No more domains to enrich in the top cohort. Run complete.');
      break;
    }

    await runPool(batch, CONCURRENCY, enrichOne);
    loops++;

    // Log progress every minute or every 5 loops
    if (Date.now() - lastProgressLog > 60_000 || loops % 5 === 0) {
      printProgress();
      lastProgressLog = Date.now();
    }
  }

  // Final report
  const elapsed = ((Date.now() - t0) / 60000).toFixed(1);
  const finalStats = await getDBStats();
  log('\n════════ WORKER COMPLETE ════════');
  log(`Session: ${totalDone} enriched | ${totalNoAds} no-ads | ${totalFailed} failed`);
  log(`Elapsed: ${elapsed} min`);
  log(`DB total enriched: ${finalStats.enriched} | fresh: ${finalStats.fresh}`);
  if (recentErrors.length) {
    log('Recent errors:');
    for (const e of recentErrors) log(`  ${e}`);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
