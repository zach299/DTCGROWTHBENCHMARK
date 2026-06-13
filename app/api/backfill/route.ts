import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain, domainCandidates } from '@/lib/utils/domain';
import { normalizeCategory } from '@/lib/categories';
import { computeMomentum, modelRevenue, spendBand } from '@/lib/intelligence';
import { logger } from '@/lib/utils/logger';

// One-time (idempotent) backfill: recompute the Phase 8 derived intelligence
// (category, growth score/momentum, modeled revenue, spend band) for companies
// already in company_meta_signals — straight from their stored ad counts and
// the master_database seed. No external calls, so it's free and fast.
//
// Processes one page per request; the client loops with ?cursor= until done.
export const maxDuration = 60;

function parseNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function POST(request: Request) {
  let cursor = 0;
  let force = false;
  try {
    const body = await request.json();
    cursor = Number(body.cursor ?? 0) || 0;
    force = !!body.force; // re-backfill even rows that already have a category
  } catch {
    /* defaults */
  }
  const PAGE = 400;
  const supabase = createServiceClient();

  try {
    const { data: rows, error } = await supabase
      .from('company_meta_signals')
      .select('domain, company_name, active_meta_ads, google_ads, linkedin_ads, landing_pages, campaign_themes, ad_activity_level, primary_category')
      .order('id', { ascending: true })
      .range(cursor, cursor + PAGE - 1);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ done: true, next_cursor: cursor, processed: 0 });
    }

    // Bulk-fetch the master seed (categories / sales / followers) for this page.
    const allCandidates = new Set<string>();
    for (const r of rows) for (const c of domainCandidates(r.domain as string)) allCandidates.add(c);
    const seedByDomain = new Map<string, Record<string, unknown>>();
    const { data: seeds } = await supabase
      .from('master_database')
      .select('domain, categories, estimated_yearly_sales, combined_followers')
      .in('domain', [...allCandidates]);
    for (const s of (seeds ?? []) as Record<string, unknown>[]) {
      seedByDomain.set(normalizeDomain(s.domain as string), s);
    }

    let updated = 0;
    for (const r of rows) {
      if (!force && r.primary_category) continue; // already backfilled
      const domain = normalizeDomain(r.domain as string);
      const seed = seedByDomain.get(domain) ?? {};
      const meta = parseNum(r.active_meta_ads);
      const google = parseNum(r.google_ads);
      const linkedin = parseNum(r.linkedin_ads);
      const lpCount = Array.isArray(r.landing_pages) ? (r.landing_pages as unknown[]).length : 0;
      const diversity = Array.isArray(r.campaign_themes) ? (r.campaign_themes as unknown[]).length : 0;
      const seedRevenue = parseNum(seed.estimated_yearly_sales);
      const followers = parseNum(seed.combined_followers);
      const paidIntensity = (r.ad_activity_level as string) ?? 'low';

      const cat = normalizeCategory((seed.categories as string) ?? null);
      const momentum = computeMomentum({ metaAds: meta, googleAds: google, linkedinAds: linkedin, landingPages: lpCount, campaignDiversity: diversity, revenue: seedRevenue, paidIntensity });
      const revenue = modelRevenue({ seedRevenue, metaAds: meta, googleAds: google, linkedinAds: linkedin, landingPages: lpCount, campaignDiversity: diversity, followers, paidIntensity });
      const spend = spendBand({ metaAds: meta, googleAds: google, linkedinAds: linkedin, paidIntensity });

      await supabase
        .from('company_meta_signals')
        .update({
          primary_category: cat.primary_category,
          subcategory: cat.subcategory,
          category_confidence: cat.confidence,
          growth_score: momentum.score,
          growth_momentum: momentum.label,
          estimated_revenue_range: revenue.range,
          revenue_confidence: revenue.confidence,
          spend_band: spend,
          followers: followers || null,
        })
        .eq('domain', r.domain as string);
      updated++;
    }

    return NextResponse.json({
      done: rows.length < PAGE,
      next_cursor: cursor + rows.length,
      processed: rows.length,
      updated,
    });
  } catch (err) {
    logger.error('backfill failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
