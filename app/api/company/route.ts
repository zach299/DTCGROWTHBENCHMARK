import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain, domainCandidates } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';
import { getTrends, getTimeline } from '@/lib/trends';
import { computeMomentum, revenueRange } from '@/lib/intelligence';

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
        .select('active_meta_ads, google_ads, linkedin_ads, company_name, primary_category, growth_score, growth_momentum, estimated_revenue_range, revenue_confidence, spend_band, ad_activity_level, landing_pages, campaign_themes, sample_ad_copy')
        .eq('domain', company.domain)
        .maybeSingle();
      storedSig = sig ?? null;
      const n = Number(sig?.active_meta_ads ?? 0);
      if (n > 0 && n < 13000) storedMeta = n;
    }

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
        from_stored_signal: true,
      };
      // Always refresh in the background to fill in the rich AI fields.
      metaRepaired = true;
    }

    // Trends from the immutable snapshot history (cheap read).
    const cachedMeta = analysis?.meta_ads as Record<string, unknown> | null;
    const [trends, timeline] = await Promise.all([
      getTrends(supabase, company.domain, {
        active_meta_ads: Number(cachedMeta?.active_ads_count ?? 0),
        landing_pages_count: Array.isArray(cachedMeta?.unique_landing_pages)
          ? (cachedMeta!.unique_landing_pages as unknown[]).length
          : 0,
        growth_score: Number(cached?.growth_score ?? 0),
      }),
      getTimeline(supabase, company.domain),
    ]);

    return NextResponse.json({
      domain: company.domain,
      company,
      analysis,
      trends,
      timeline,
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
