import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain, domainCandidates } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';
import { trendStatus, getTrends, getTimeline } from '@/lib/trends';
import { computeMomentum, revenueRange } from '@/lib/intelligence';
import { estimateMonthlySpend } from '@/lib/adSpend';

// Fast path: returns master_database company data + the latest cached analysis
// (if any) without running any external enrichment. Target < 500ms.
export const maxDuration = 15;

const bodySchema = z.object({ domain: z.string().min(1) });

const CACHE_TTL_DAYS = 7;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '"domain" is required' }, { status: 400 });
  }

  const rawDomain = parsed.data.domain;
  const domain = normalizeDomain(rawDomain);
  const supabase = createServiceClient();

  try {
    // master_database stores domains inconsistently (bare / www. / http(s)://
    // / trailing slash) — match any common form.
    const candidates = domainCandidates(rawDomain);
    const { data: rows } = await supabase
      .from('master_database')
      .select('*')
      .in('domain', candidates)
      .limit(1);
    // Not in the Store Leads DB? Synthesize a minimal company so any domain can
    // still be analyzed (Meta/Google/LinkedIn/website all work from the domain).
    const company =
      rows?.[0] ?? {
        id: null,
        domain,
        platform: null,
        categories: null,
        estimated_yearly_sales: null,
        combined_followers: null,
        company_location: null,
        facebook_url: null,
        instagram_url: null,
        tiktok_url: null,
        average_product_price: null,
      };
    company.domain = normalizeDomain(company.domain);
    const inDb = company.id != null;

    let cached: Record<string, unknown> | null = null;
    if (inDb) {
      const res = await supabase
        .from('domain_analyses')
        .select('*')
        .eq('master_database_id', company.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      cached = res.data;
    }

    let analysis: Record<string, unknown> | null = null;
    let cacheAgeDays: number | null = null;
    let cacheFresh = false;
    let metaRepaired = false;

    // The bulk Meta signal is more reliable than a single live scrape (which can
    // intermittently return 0). Use it to repair a cached/zero Meta count, and —
    // when there's no full analysis cached yet — to render real data instantly
    // instead of skeletons (the full enrichment then fills in the rich fields).
    let storedMeta = 0;
    let storedSig: Record<string, unknown> | null = null;
    {
      const { data: sig } = await supabase
        .from('company_meta_signals')
        .select('active_meta_ads, google_ads, linkedin_ads, company_name, primary_category, growth_score, growth_momentum, estimated_revenue_range, revenue_confidence, spend_band, ad_activity_level, landing_pages, campaign_themes, sample_ad_copy, real_creative_score, quality_adjusted_ads, unique_creative_count, creative_diversity_score, campaign_angle_count, offer_diversity, landing_page_diversity, dpa_share')
        .eq('domain', company.domain)
        .maybeSingle();
      storedSig = sig ?? null;
      const n = Number(sig?.active_meta_ads ?? 0);
      if (n > 0 && n < 13000) storedMeta = n;
    }

    // Paid Media Quality (catalog/DPA vs. real creative) from the stored signal.
    const paidMediaQuality =
      storedSig && storedSig.real_creative_score != null
        ? {
            real_creative_score: Number(storedSig.real_creative_score ?? 0),
            quality_adjusted_ads: Number(storedSig.quality_adjusted_ads ?? 0),
            unique_creative_count: Number(storedSig.unique_creative_count ?? 0),
            creative_diversity_score: Number(storedSig.creative_diversity_score ?? 0),
            campaign_angle_count: Number(storedSig.campaign_angle_count ?? 0),
            offer_diversity: Number(storedSig.offer_diversity ?? 0),
            landing_page_diversity: Number(storedSig.landing_page_diversity ?? 0),
            dpa_share: Number(storedSig.dpa_share ?? 0),
          }
        : null;

    if (cached) {
      cacheAgeDays = (Date.now() - new Date(cached.created_at as string).getTime()) / 86_400_000;
      cacheFresh = cacheAgeDays <= CACHE_TTL_DAYS;
      const raw = (cached.raw_response ?? {}) as Record<string, unknown>;
      let cachedMeta = (raw.meta_ads ?? null) as Record<string, unknown> | null;
      // Repair a false 0 from the cached live scrape with the stored bulk count,
      // and flag a background refresh so the narrative/ad-platforms heal too.
      if (Number(cachedMeta?.active_ads_count ?? 0) === 0 && storedMeta > 0) {
        cachedMeta = { ...(cachedMeta ?? {}), active_ads_count: storedMeta };
        metaRepaired = true;
      }
      const sales = (() => {
        const v = (company as Record<string, unknown>).estimated_yearly_sales;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const n = parseFloat(v.replace(/[^0-9.]/g, ''));
          return Number.isFinite(n) ? n : 0;
        }
        return 0;
      })();
      const metaAds = Number(cachedMeta?.active_ads_count ?? 0);
      const lps = Array.isArray(cachedMeta?.unique_landing_pages)
        ? (cachedMeta!.unique_landing_pages as unknown[]).length
        : 0;
      const growth_momentum =
        (raw.growth_momentum as string | undefined) ??
        computeMomentum({
          metaAds,
          googleAds: 0,
          linkedinAds: 0,
          landingPages: lps,
          campaignDiversity: 0,
          revenue: sales,
          paidIntensity: String(cached.paid_media_signal ?? 'low'),
        }).label;
      analysis = {
        growth_score: cached.growth_score,
        growth_momentum,
        paid_media_signal: cached.paid_media_signal,
        revenue_range: (raw.revenue_range as string | undefined) ?? revenueRange(sales).range,
        revenue_confidence:
          (raw.revenue_confidence as string | undefined) ?? revenueRange(sales).confidence,
        recommended_buyer: cached.recommended_buyer,
        recommended_angle: cached.recommended_angle,
        outbound_hook: cached.outbound_hook,
        reasons: cached.reasons,
        meta_ads: cachedMeta,
        brand_context: raw.brand_context ?? null,
        website_signals: raw.website_signals ?? null,
        tech_stack: raw.tech_stack ?? null,
        server_side_signals: raw.server_side_signals ?? null,
        ad_platforms: raw.ad_platforms ?? null,
        landing_page_signals: raw.landing_page_signals ?? null,
        growth_narrative: raw.growth_narrative ?? null,
        growth_prompt: raw.growth_prompt ?? null,
        research_brief: raw.research_brief ?? null,
        paid_media_quality: paidMediaQuality,
      };
    } else if (storedSig) {
      // No full analysis cached, but we have a bulk-enriched signal — render it
      // immediately (no skeletons). The client still triggers a background full
      // enrichment to fill in narrative, ad platforms and research brief.
      const lps = Array.isArray(storedSig.landing_pages) ? (storedSig.landing_pages as unknown[]) : [];
      const themes = Array.isArray(storedSig.campaign_themes) ? (storedSig.campaign_themes as string[]) : [];
      const metaCount = storedMeta || Number(storedSig.active_meta_ads ?? 0);
      analysis = {
        growth_score: storedSig.growth_score ?? null,
        growth_momentum: storedSig.growth_momentum ?? null,
        paid_media_signal: storedSig.ad_activity_level ?? null,
        revenue_range: storedSig.estimated_revenue_range ?? null,
        revenue_confidence: storedSig.revenue_confidence ?? null,
        spend_band: storedSig.spend_band ?? null,
        primary_category: storedSig.primary_category ?? null,
        recommended_buyer: null,
        recommended_angle: null,
        outbound_hook: null,
        reasons: null,
        meta_ads: {
          advertiser_name: storedSig.company_name ?? null,
          active_ads_count: metaCount,
          unique_landing_pages: lps,
          sample_ad_copy: Array.isArray(storedSig.sample_ad_copy) ? storedSig.sample_ad_copy : [],
          sample_creatives: [],
        },
        ad_platforms: [
          { platform: 'Meta', status: metaCount > 0 ? 'active' : 'none', ads_count: metaCount },
          { platform: 'Google', status: Number(storedSig.google_ads ?? 0) > 0 ? 'active' : 'none', ads_count: Number(storedSig.google_ads ?? 0) },
          { platform: 'LinkedIn', status: Number(storedSig.linkedin_ads ?? 0) > 0 ? 'active' : 'none', ads_count: Number(storedSig.linkedin_ads ?? 0) },
        ],
        landing_page_signals: { campaign_themes: themes },
        brand_context: null,
        website_signals: null,
        tech_stack: null,
        server_side_signals: null,
        growth_narrative: null,
        growth_prompt: null,
        research_brief: null,
        paid_media_quality: paidMediaQuality,
        from_stored_signal: true,
      };
      // Always refresh in the background to fill in the rich AI fields.
      metaRepaired = true;
    }

    // Estimated monthly ad spend — pure heuristic over the stored signal (or,
    // failing that, the cached analysis fields).
    const analysisMeta = analysis?.meta_ads as Record<string, unknown> | null;
    const spendEstimate = estimateMonthlySpend({
      metaAds: storedMeta || Number(analysisMeta?.active_ads_count ?? 0),
      googleAds: storedSig ? Number(storedSig.google_ads ?? 0) : null,
      linkedinAds: storedSig ? Number(storedSig.linkedin_ads ?? 0) : null,
      qualityAdjustedAds:
        storedSig?.quality_adjusted_ads != null ? Number(storedSig.quality_adjusted_ads) : null,
      landingPages: Array.isArray(storedSig?.landing_pages)
        ? (storedSig!.landing_pages as unknown[]).length
        : Array.isArray(analysisMeta?.unique_landing_pages)
          ? (analysisMeta!.unique_landing_pages as unknown[]).length
          : null,
      creativeDiversityScore:
        storedSig?.creative_diversity_score != null
          ? Number(storedSig.creative_diversity_score)
          : null,
      revenueRange:
        (storedSig?.estimated_revenue_range as string | null) ??
        ((analysis?.revenue_range as string | undefined) || null),
      paidIntensity:
        (storedSig?.ad_activity_level as string | null) ??
        ((analysis?.paid_media_signal as string | undefined) || null),
    });

    // Snapshot history for the Growth Over Time chart (ascending, up to 90).
    const historyPromise = supabase
      .from('domain_snapshots')
      .select(
        'snapshot_date, active_meta_ads, active_google_ads, active_linkedin_ads, landing_pages_count, growth_score, growth_momentum'
      )
      .eq('domain', company.domain)
      .order('snapshot_date', { ascending: true })
      .limit(90);

    // Trends from the immutable snapshot history (cheap read).
    const cachedMeta = analysis?.meta_ads as Record<string, unknown> | null;
    const [trends, timeline, historyRes] = await Promise.all([
      getTrends(supabase, company.domain, {
        active_meta_ads: Number(cachedMeta?.active_ads_count ?? 0),
        landing_pages_count: Array.isArray(cachedMeta?.unique_landing_pages)
          ? (cachedMeta!.unique_landing_pages as unknown[]).length
          : 0,
        growth_score: Number(cached?.growth_score ?? 0),
      }),
      getTimeline(supabase, company.domain),
      historyPromise,
    ]);

    // Mark as priority so the nightly worker refreshes viewed brands within 24h.
    supabase
      .from('domain_priority')
      .upsert({ domain: company.domain, last_viewed_at: new Date().toISOString() }, { onConflict: 'domain' })
      .then(undefined, () => {});

    const historyRows = historyRes.data ?? [];
    return NextResponse.json({
      domain: company.domain,
      company,
      analysis,
      trends,
      timeline,
      history: historyRows,
      trend_status: trendStatus(historyRows.length),
      spend_estimate: spendEstimate,
      cache_age_days: cacheAgeDays != null ? Math.round(cacheAgeDays * 10) / 10 : null,
      cache_fresh: cacheFresh,
      // Trigger background enrichment when there's no fresh cache, or when we
      // had to repair a stale zero (so the narrative/ad-platforms regenerate).
      needs_enrichment: !cacheFresh || metaRepaired,
    });
  } catch (err) {
    logger.error('company lookup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
