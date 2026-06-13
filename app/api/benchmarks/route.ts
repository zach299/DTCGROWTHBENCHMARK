import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { computeCategoryBenchmarks, type BenchRow } from '@/lib/benchmarks';
import { logger } from '@/lib/utils/logger';

// Category benchmarks over the enriched dataset. Cached in-process for a few
// minutes so the dashboard/profile can call it freely.
export const maxDuration = 20;

let cache: { at: number; payload: unknown } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.payload);
  }
  const supabase = createServiceClient();
  try {
    const rows = await fetchAllEnriched(supabase);
    const categories = computeCategoryBenchmarks(rows);
    const payload = { categories, total_enriched: rows.length, generated_at: new Date().toISOString() };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    logger.error('benchmarks failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ categories: [], total_enriched: 0 });
  }
}

// Shared loader: pull the lean columns needed for benchmarking, paging past the
// 1000-row default so the whole enriched set is included.
export async function fetchAllEnriched(
  supabase: ReturnType<typeof createServiceClient>
): Promise<BenchRow[]> {
  const out: BenchRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('company_meta_signals')
      .select('primary_category, active_meta_ads, google_ads, linkedin_ads, landing_pages, growth_score')
      // Exclude pre-fix keyword contamination so percentiles aren't skewed.
      .lt('active_meta_ads', 13000)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data as Record<string, unknown>[]) {
      out.push({
        primary_category: (r.primary_category as string) ?? 'Other',
        active_meta_ads: Number(r.active_meta_ads ?? 0),
        google_ads: Number(r.google_ads ?? 0),
        linkedin_ads: Number(r.linkedin_ads ?? 0),
        landing_pages_count: Array.isArray(r.landing_pages) ? (r.landing_pages as unknown[]).length : 0,
        growth_score: Number(r.growth_score ?? 0),
      });
    }
    if (data.length < PAGE) break;
  }
  return out;
}
