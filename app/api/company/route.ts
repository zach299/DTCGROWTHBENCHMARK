import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
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
    let { data: company } = await supabase
      .from('master_database')
      .select('*')
      .eq('domain', domain)
      .maybeSingle();
    if (!company && rawDomain !== domain) {
      const res = await supabase
        .from('master_database')
        .select('*')
        .eq('domain', rawDomain)
        .maybeSingle();
      company = res.data;
    }
    if (!company) {
      return NextResponse.json({ error: 'Domain not found in database', domain }, { status: 404 });
    }

    const { data: cached } = await supabase
      .from('domain_analyses')
      .select('*')
      .eq('master_database_id', company.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let analysis: Record<string, unknown> | null = null;
    let cacheAgeDays: number | null = null;
    let cacheFresh = false;

    if (cached) {
      cacheAgeDays = (Date.now() - new Date(cached.created_at).getTime()) / 86_400_000;
      cacheFresh = cacheAgeDays <= CACHE_TTL_DAYS;
      const raw = (cached.raw_response ?? {}) as Record<string, unknown>;
      const cachedMeta = (raw.meta_ads ?? null) as Record<string, unknown> | null;
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
      // Client should trigger background enrichment when there's no fresh cache.
      needs_enrichment: !cacheFresh,
    });
  } catch (err) {
    logger.error('company lookup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
