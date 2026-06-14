import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchMetaAdsSignals } from '@/lib/providers/apifyMetaAds';
import { inferCampaignThemes } from '@/lib/providers/crawlHomepage';
import { normalizeDomain, domainCandidates } from '@/lib/utils/domain';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import { normalizeCategory } from '@/lib/categories';
import { computeMomentum, modelRevenue, spendBand } from '@/lib/intelligence';
import { analyzeCreativeQuality } from '@/lib/creativeQuality';

// Meta-only enrichment for the bulk dataset. No website crawl, no Google /
// LinkedIn, no AI. Returns the computed Meta signals; the bulk script persists
// them to company_meta_signals.
export const maxDuration = 300;

const bodySchema = z.object({
  domain: z.string().min(1),
  facebook_url: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  google_ads: z.number().nullable().optional(),
  linkedin_ads: z.number().nullable().optional(),
  source: z.string().nullable().optional(),
});

function parseNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function velocityLabel(count: number): string {
  if (count >= 100) return 'High';
  if (count >= 25) return 'Medium';
  if (count >= 1) return 'Low';
  return 'None';
}
function diversityLabel(n: number): string {
  if (n >= 5) return 'High';
  if (n >= 3) return 'Medium';
  if (n >= 1) return 'Low';
  return 'None';
}
function activityLevel(c: number): string {
  if (c >= 50) return 'high';
  if (c >= 10) return 'medium';
  if (c >= 1) return 'low';
  return 'none';
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'domain required' }, { status: 400 });
  }
  if (!process.env.APIFY_TOKEN) {
    return NextResponse.json({ ok: false, error: 'APIFY_TOKEN not set' }, { status: 500 });
  }

  const domain = normalizeDomain(parsed.data.domain);
  const supabase = createServiceClient();
  try {
    const meta = await fetchMetaAdsSignals(parsed.data.facebook_url ?? null, domain);
    const count = meta.active_ads_count;
    const themes = inferCampaignThemes(meta.unique_landing_pages);
    const lpCount = meta.unique_landing_pages.length;
    const googleAds = parseNum(parsed.data.google_ads);
    const linkedinAds = parseNum(parsed.data.linkedin_ads);
    const channelCount = 1 + (googleAds > 0 ? 1 : 0) + (linkedinAds > 0 ? 1 : 0);

    // Paid Media Quality: inspect the creative sample to separate genuine
    // campaign creative from catalog/DPA/product-feed volume. Ranking + intensity
    // use the quality-adjusted ad count, not the raw total.
    const quality = analyzeCreativeQuality(meta.raw, count, meta.unique_landing_pages, channelCount);
    const effectiveAds = quality.quality_adjusted_ads;
    const paidIntensity = activityLevel(effectiveAds);

    // Pull seed attributes from master_database (categories / sales / followers)
    // to feed category normalization and the revenue model.
    let categoriesRaw: string | null = null;
    let seedRevenue = 0;
    let followers = 0;
    try {
      const { data: seed } = await supabase
        .from('master_database')
        .select('categories, estimated_yearly_sales, combined_followers')
        .in('domain', domainCandidates(domain))
        .limit(1);
      const row = seed?.[0] as Record<string, unknown> | undefined;
      if (row) {
        categoriesRaw = (row.categories as string) ?? null;
        seedRevenue = parseNum(row.estimated_yearly_sales);
        followers = parseNum(row.combined_followers);
      }
    } catch {
      /* seed is optional */
    }

    const cat = normalizeCategory(categoriesRaw);
    // Rank on quality-adjusted ads + distinct angles, not raw catalog volume.
    const momentum = computeMomentum({
      metaAds: effectiveAds,
      googleAds,
      linkedinAds,
      landingPages: Math.max(lpCount, quality.landing_page_diversity),
      campaignDiversity: Math.max(themes.length, quality.campaign_angle_count),
      revenue: seedRevenue,
      paidIntensity,
    });
    const revenue = modelRevenue({
      seedRevenue,
      metaAds: count,
      googleAds,
      linkedinAds,
      landingPages: lpCount,
      campaignDiversity: themes.length,
      followers,
      paidIntensity,
    });
    const spend = spendBand({ metaAds: count, googleAds, linkedinAds, paidIntensity });

    const signals = {
      domain,
      company_name: parsed.data.company_name ?? meta.advertiser_name ?? null,
      active_meta_ads: count,
      google_ads: googleAds,
      linkedin_ads: linkedinAds,
      creative_count: count, // each active ad is a distinct creative
      creative_velocity: velocityLabel(count),
      campaign_diversity: diversityLabel(lpCount),
      ad_activity_level: paidIntensity,
      landing_pages: meta.unique_landing_pages,
      campaign_themes: themes,
      sample_ad_copy: meta.sample_ad_copy,
      first_seen_date: meta.first_seen_date,
      last_seen_date: null,
      raw_meta_response: meta.raw,
      // Phase 8 derived intelligence
      primary_category: cat.primary_category,
      subcategory: cat.subcategory,
      category_confidence: cat.confidence,
      growth_score: momentum.score,
      growth_momentum: momentum.label,
      estimated_revenue_range: revenue.range,
      revenue_confidence: revenue.confidence,
      spend_band: spend,
      followers: followers || null,
      source: parsed.data.source ?? 'bulk',
      // Paid Media Quality model
      unique_creative_count: quality.unique_creative_count,
      creative_diversity_score: quality.creative_diversity_score,
      campaign_angle_count: quality.campaign_angle_count,
      offer_diversity: quality.offer_diversity,
      landing_page_diversity: quality.landing_page_diversity,
      dpa_share: quality.dpa_share,
      real_creative_score: quality.real_creative_score,
      quality_adjusted_ads: quality.quality_adjusted_ads,
    };

    // Persist so a UI/browser-driven run doesn't need direct DB access.
    try {
      await supabase
        .from('company_meta_signals')
        .upsert({ ...signals, last_enriched_at: new Date().toISOString() }, { onConflict: 'domain' });
    } catch (e) {
      logger.error('enrich-meta persist failed', {
        domain,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return NextResponse.json({ ok: true, signals });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('enrich-meta failed', { domain, error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
