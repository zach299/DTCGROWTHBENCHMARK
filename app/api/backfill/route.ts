import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain, domainCandidates } from '@/lib/utils/domain';
import { normalizeCategory } from '@/lib/categories';
import { computeMomentum, modelRevenue, spendBand } from '@/lib/intelligence';
import { analyzeCreativeQuality } from '@/lib/creativeQuality';
import { logger } from '@/lib/utils/logger';
import { requireApiKey } from '@/lib/apiAuth';

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
  const denied = requireApiKey(request);
  if (denied) return denied;

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
      .select('domain, company_name, active_meta_ads, google_ads, linkedin_ads, landing_pages, campaign_themes, ad_activity_level, primary_category, raw_meta_response, real_creative_score')
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
      // Re-run if not yet backfilled, or missing the creative-quality metrics.
      if (!force && r.primary_category && r.real_creative_score != null) continue;
      const domain = normalizeDomain(r.domain as string);
      const seed = seedByDomain.get(domain) ?? {};
      const meta = parseNum(r.active_meta_ads);
      const google = parseNum(r.google_ads);
      const linkedin = parseNum(r.linkedin_ads);
      const landingPages = Array.isArray(r.landing_pages) ? (r.landing_pages as string[]) : [];
      const lpCount = landingPages.length;
      const diversity = Array.isArray(r.campaign_themes) ? (r.campaign_themes as unknown[]).length : 0;
      const seedRevenue = parseNum(seed.estimated_yearly_sales);
      const followers = parseNum(seed.combined_followers);
      const channelCount = 1 + (google > 0 ? 1 : 0) + (linkedin > 0 ? 1 : 0);

      // Recompute creative quality from the stored raw Meta sample (no rescrape).
      const quality = analyzeCreativeQuality(r.raw_meta_response, meta, landingPages, channelCount);
      const effectiveAds = quality.quality_adjusted_ads;
      const paidIntensity = effectiveAds >= 50 ? 'high' : effectiveAds >= 10 ? 'medium' : effectiveAds >= 1 ? 'low' : 'none';

      const cat = normalizeCategory((seed.categories as string) ?? null);
      const momentum = computeMomentum({ metaAds: effectiveAds, googleAds: google, linkedinAds: linkedin, landingPages: Math.max(lpCount, quality.landing_page_diversity), campaignDiversity: Math.max(diversity, quality.campaign_angle_count), revenue: seedRevenue, paidIntensity });
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
          ad_activity_level: paidIntensity,
          unique_creative_count: quality.unique_creative_count,
          creative_diversity_score: quality.creative_diversity_score,
          campaign_angle_count: quality.campaign_angle_count,
          offer_diversity: quality.offer_diversity,
          landing_page_diversity: quality.landing_page_diversity,
          dpa_share: quality.dpa_share,
          real_creative_score: quality.real_creative_score,
          quality_adjusted_ads: quality.quality_adjusted_ads,
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
