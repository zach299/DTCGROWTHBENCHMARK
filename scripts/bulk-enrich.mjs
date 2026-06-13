#!/usr/bin/env node
// Phase 6 — Bulk Meta enrichment.
// Enriches the top Shopify stores with Meta ad intelligence ONLY (no Google /
// LinkedIn / crawl / AI). Writes to company_meta_signals and tracks the run in
// enrichment_jobs. Run: `node scripts/bulk-enrich.mjs [limit]`
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- load .env.local ----
try {
  const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {
  /* .env.local optional if env already set */
}

// ---- config (override via env) ----
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = (process.env.GROWTH_SIGNALS_API_BASE || 'https://dtcgrowthbenchmark.vercel.app').replace(/\/$/, '');
const SOURCE_TABLE = process.env.SOURCE_TABLE || 'master_database';
const SALES_COLUMN = process.env.SALES_COLUMN || 'estimated_yearly_sales';
const PLATFORM = process.env.PLATFORM || 'shopify';

const HARD_STOP = Number(process.argv[2] || process.env.HARD_STOP || 1000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 100);
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const RETRIES = Number(process.env.RETRIES || 2);
const SKIP_DAYS = Number(process.env.SKIP_DAYS || 30);
const COST_PER_DOMAIN = Number(process.env.COST_PER_DOMAIN || 0.01);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local).');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const parseSales = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runPool(items, concurrency, worker) {
  let i = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

async function enrichOne(row) {
  const body = JSON.stringify({
    domain: row.domain,
    facebook_url: row.facebook_url ?? null,
    company_name: row.company_name ?? null,
  });
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/api/enrich-meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await res.json();
      if (data.ok) return data.signals;
      if (attempt === RETRIES) throw new Error(data.error || `HTTP ${res.status}`);
    } catch (e) {
      if (attempt === RETRIES) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
}

async function main() {
  console.log(`\n⚡ Bulk Meta enrichment — top ${HARD_STOP} ${PLATFORM} stores from ${SOURCE_TABLE}\n`);

  // 1. Candidate set: fetch a buffer ordered by sales, then sort numerically.
  const FETCH = HARD_STOP * 5;
  const { data: candidates, error: cErr } = await supabase
    .from(SOURCE_TABLE)
    .select('*')
    .ilike('platform', `%${PLATFORM}%`)
    .order(SALES_COLUMN, { ascending: false })
    .limit(FETCH);
  if (cErr) {
    console.error('Source query failed:', cErr.message);
    process.exit(1);
  }
  candidates.sort((a, b) => parseSales(b[SALES_COLUMN]) - parseSales(a[SALES_COLUMN]));

  // 2. Skip companies enriched in the last SKIP_DAYS.
  const cutoff = new Date(Date.now() - SKIP_DAYS * 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from('company_meta_signals')
    .select('domain')
    .gte('last_enriched_at', cutoff);
  const skip = new Set((recent ?? []).map((r) => r.domain));

  const targets = candidates.filter((c) => !skip.has(c.domain)).slice(0, HARD_STOP);
  console.log(`Candidates fetched: ${candidates.length} | already fresh (skipped): ${skip.size} | to process: ${targets.length}\n`);
  if (targets.length === 0) {
    console.log('Nothing to enrich.');
    return;
  }

  // 3. Create job.
  const { data: jobRows } = await supabase
    .from('enrichment_jobs')
    .insert({ notes: `bulk meta, source=${SOURCE_TABLE}, target=${targets.length}` })
    .select('job_id')
    .single();
  const jobId = jobRows?.job_id;

  let processed = 0, ok = 0, failed = 0;
  let totalAds = 0, totalLp = 0;
  const t0 = Date.now();

  // 4. Process in batches with bounded concurrency + retries.
  for (let b = 0; b < targets.length; b += BATCH_SIZE) {
    const batch = targets.slice(b, b + BATCH_SIZE);
    await runPool(batch, CONCURRENCY, async (row) => {
      try {
        const s = await enrichOne(row);
        const { error } = await supabase.from('company_meta_signals').upsert(
          {
            domain: s.domain,
            company_name: s.company_name ?? row.company_name ?? null,
            active_meta_ads: s.active_meta_ads,
            creative_count: s.creative_count,
            creative_velocity: s.creative_velocity,
            campaign_diversity: s.campaign_diversity,
            ad_activity_level: s.ad_activity_level,
            landing_pages: s.landing_pages,
            campaign_themes: s.campaign_themes,
            sample_ad_copy: s.sample_ad_copy,
            first_seen_date: s.first_seen_date,
            last_seen_date: s.last_seen_date,
            raw_meta_response: s.raw_meta_response,
            last_enriched_at: new Date().toISOString(),
          },
          { onConflict: 'domain' }
        );
        if (error) throw error;
        ok += 1;
        totalAds += s.active_meta_ads || 0;
        totalLp += (s.landing_pages || []).length;
      } catch (e) {
        failed += 1;
        console.warn(`  ✗ ${row.domain}: ${e.message?.slice(0, 100)}`);
      } finally {
        processed += 1;
        if (processed % 10 === 0) process.stdout.write(`  …${processed}/${targets.length} (ok ${ok}, fail ${failed})\n`);
      }
    });
    // Update job progress after each batch.
    await supabase
      .from('enrichment_jobs')
      .update({
        domains_processed: processed,
        domains_successful: ok,
        domains_failed: failed,
        estimated_cost: Math.round(processed * COST_PER_DOMAIN * 100) / 100,
      })
      .eq('job_id', jobId);
  }

  // 5. Finalize + report.
  const spend = Math.round(processed * COST_PER_DOMAIN * 100) / 100;
  await supabase
    .from('enrichment_jobs')
    .update({
      completed_at: new Date().toISOString(),
      domains_processed: processed,
      domains_successful: ok,
      domains_failed: failed,
      estimated_cost: spend,
    })
    .eq('job_id', jobId);

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log('\n────────── COMPLETION REPORT ──────────');
  console.log(`Domains processed:      ${processed}`);
  console.log(`Successful:             ${ok}`);
  console.log(`Failed:                 ${failed}`);
  console.log(`Success rate:           ${processed ? Math.round((ok / processed) * 100) : 0}%`);
  console.log(`Estimated spend:        $${spend}  (~$${COST_PER_DOMAIN}/domain)`);
  console.log(`Avg active Meta ads:    ${ok ? Math.round(totalAds / ok) : 0}`);
  console.log(`Avg landing pages:      ${ok ? (totalLp / ok).toFixed(1) : 0}`);
  console.log(`Elapsed:                ${mins} min`);
  console.log('───────────────────────────────────────');
  console.log('\nHARD STOP reached. Review the numbers before running the next batch.\n');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
