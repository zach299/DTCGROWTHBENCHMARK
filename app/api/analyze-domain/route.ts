import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';
import { fetchMetaAdsSignals, type MetaAdsSignals } from '@/lib/providers/apifyMetaAds';
import {
  crawlHomepage,
  inferCampaignThemes,
  type BrandContext,
  type WebsiteSignals,
  type DetectedTech,
} from '@/lib/providers/crawlHomepage';
import { generateNarrative } from '@/lib/providers/generateNarrative';

// Apify run-sync can take up to ~2 minutes; allow generous function duration.
// Note: Vercel hobby plan caps maxDuration lower (60s) — this takes effect on Pro+.
export const maxDuration = 300;

const bodySchema = z.object({
  domain: z.string().min(1),
});

interface MasterRow {
  id: number;
  domain: string;
  average_product_price: string | null;
  categories: string | null;
  combined_followers: string | null;
  company_location: string | null;
  estimated_yearly_sales: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  platform: string | null;
  tiktok_url: string | null;
}

function parseNumeric(value: string | null): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function formatMoney(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1_000)}K`;
}

type AdActivityLevel = 'high' | 'medium' | 'low' | 'none' | 'unknown';

function adActivityLevel(meta: MetaAdsSignals | null): AdActivityLevel {
  if (!meta) return 'unknown';
  const c = meta.active_ads_count;
  if (c >= 50) return 'high';
  if (c >= 10) return 'medium';
  if (c >= 1) return 'low';
  return 'none';
}

function computeScores(company: MasterRow, meta: MetaAdsSignals | null) {
  const followers = parseNumeric(company.combined_followers);
  const sales = parseNumeric(company.estimated_yearly_sales);
  const adsCount = meta?.active_ads_count ?? 0;
  const landingPagesCount = meta?.unique_landing_pages.length ?? 0;
  const platform = (company.platform ?? '').toLowerCase();
  const isShopify = platform.includes('shopify');
  const socialChannels = [company.facebook_url, company.instagram_url, company.tiktok_url].filter(
    Boolean
  ).length;

  const reasons: string[] = [];

  let growth = 0;

  if (meta) {
    if (adsCount >= 100) growth += 35;
    else if (adsCount >= 50) growth += 30;
    else if (adsCount >= 25) growth += 25;
    else if (adsCount >= 10) growth += 18;
    else if (adsCount >= 1) growth += 10;

    if (landingPagesCount >= 10) growth += 15;
    else if (landingPagesCount >= 6) growth += 12;
    else if (landingPagesCount >= 3) growth += 8;
    else if (landingPagesCount >= 1) growth += 3;

    if (adsCount > 0) {
      reasons.push(`${adsCount} active Meta ads`);
    } else {
      reasons.push('No active Meta ads found in Ad Library');
    }
    if (landingPagesCount >= 10) {
      reasons.push(`${landingPagesCount} unique landing pages — heavy funnel testing`);
    } else if (landingPagesCount >= 3) {
      reasons.push(`${landingPagesCount} unique landing pages in active ads`);
    }
    if (meta.platforms.length > 0) {
      const names = meta.platforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
      reasons.push(`Active on ${names.join(' + ')}`);
    }
  } else {
    reasons.push('Meta Ad Library data unavailable');
  }

  if (sales > 0) {
    growth += Math.min(20, Math.log10(sales) * 3);
    reasons.push(`Estimated yearly sales: ${formatMoney(sales)}`);
  }
  if (followers > 0) {
    growth += Math.min(15, Math.log10(followers) * 3);
  }
  if (isShopify) {
    growth += 8;
    reasons.push('Runs on Shopify');
  }
  if (socialChannels >= 2) {
    growth += 7;
    reasons.push(`Present on ${socialChannels} social channels`);
  }

  const growth_score = clamp(growth);

  let fit = 0;
  if (meta) {
    if (adsCount >= 50) fit += 35;
    else if (adsCount >= 10) fit += 25;
    else if (adsCount >= 1) fit += 15;

    if (landingPagesCount >= 10) fit += 15;
    else if (landingPagesCount >= 5) fit += 8;

    if (adsCount > 0) fit += 10;
  }
  if (sales > 0) fit += Math.min(25, Math.log10(sales) * 4);
  if (isShopify) fit += 10;
  if (socialChannels >= 2) fit += 5;

  const northbeam_fit_score = clamp(fit);

  const activity = adActivityLevel(meta);
  const paid_media_signal = activity === 'unknown' || activity === 'none' ? 'low' : activity;

  const recommended_buyer =
    growth_score < 40 ? 'Founder / CEO' : 'VP Growth / Head of Performance Marketing';

  const category = company.categories?.split(/[,;|/]/)[0]?.trim() || 'DTC';
  const recommended_angle =
    activity === 'high' || activity === 'medium'
      ? 'Measurement + incrementality across scaling paid channels'
      : `Help their ${category} brand scale paid acquisition with better attribution and incrementality measurement.`;

  let outbound_hook: string;
  if (meta && adsCount > 0) {
    outbound_hook = `Noticed ${meta.advertiser_name ?? company.domain} is running ${adsCount} active Meta ads across ${landingPagesCount} landing pages — brands testing at this volume are often struggling to see which campaigns are truly incremental.`;
  } else {
    const followerHook =
      followers > 0
        ? `With ${followers.toLocaleString()} combined social followers`
        : `As a ${company.platform || 'DTC'} brand`;
    outbound_hook = `${followerHook}, ${company.domain} is well positioned to scale paid media — but most brands at this stage are flying blind on attribution.`;
  }

  return {
    growth_score,
    northbeam_fit_score,
    paid_media_signal,
    recommended_buyer,
    recommended_angle,
    outbound_hook,
    reasons: reasons.slice(0, 6),
    ad_activity_level: activity,
  };
}

function metaAdsResponse(meta: MetaAdsSignals | null, activity: AdActivityLevel) {
  if (!meta) return null;
  return {
    advertiser_name: meta.advertiser_name,
    active_ads_count: meta.active_ads_count,
    ad_activity_level: activity,
    unique_landing_pages: meta.unique_landing_pages,
    sample_ad_copy: meta.sample_ad_copy,
    sample_creatives: meta.sample_creatives,
    platforms: meta.platforms,
    first_seen_date: meta.first_seen_date,
  };
}

type RawResponse = {
  method?: string;
  inputs?: unknown;
  meta_ads?: Record<string, unknown> | null;
  apify_raw?: unknown;
  brand_context?: BrandContext | null;
  website_signals?: WebsiteSignals | null;
  tech_stack?: DetectedTech[] | null;
  landing_page_signals?: { campaign_themes: string[] } | null;
  growth_narrative?: string | null;
  growth_prompt?: string | null;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body: "domain" is required' },
      { status: 400 }
    );
  }

  const rawDomain = parsed.data.domain;
  const domain = normalizeDomain(rawDomain);
  const supabase = createServiceClient();

  try {
    const lookup = await supabase
      .from('master_database')
      .select('*')
      .eq('domain', domain)
      .maybeSingle<MasterRow>();

    if (lookup.error) {
      logger.error('master_database lookup failed', { error: lookup.error.message });
      return NextResponse.json(
        { error: `Database lookup failed: ${lookup.error.message}` },
        { status: 500 }
      );
    }

    let company = lookup.data;

    if (!company && rawDomain !== domain) {
      const res = await supabase
        .from('master_database')
        .select('*')
        .eq('domain', rawDomain)
        .maybeSingle<MasterRow>();
      if (res.error) {
        logger.error('master_database lookup failed', { error: res.error.message });
        return NextResponse.json(
          { error: `Database lookup failed: ${res.error.message}` },
          { status: 500 }
        );
      }
      company = res.data;
    }

    if (!company) {
      return NextResponse.json(
        { error: 'Domain not found in database', domain },
        { status: 404 }
      );
    }

    // Check cache
    const { data: cached } = await supabase
      .from('domain_analyses')
      .select('*')
      .eq('master_database_id', company.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      const raw = (cached.raw_response ?? {}) as RawResponse;
      const cachedMeta = raw.meta_ads ?? null;
      let cachedMetaOut: Record<string, unknown> | null = null;
      if (cachedMeta) {
        const count = Number(cachedMeta.active_ads_count ?? 0);
        cachedMetaOut = {
          ...cachedMeta,
          ad_activity_level:
            cachedMeta.ad_activity_level ??
            (count >= 50 ? 'high' : count >= 10 ? 'medium' : count >= 1 ? 'low' : 'none'),
        };
      }
      return NextResponse.json({
        domain: company.domain,
        growth_score: cached.growth_score,
        northbeam_fit_score: cached.northbeam_fit_score,
        paid_media_signal: cached.paid_media_signal,
        recommended_buyer: cached.recommended_buyer,
        recommended_angle: cached.recommended_angle,
        outbound_hook: cached.outbound_hook,
        reasons: cached.reasons,
        meta_ads: cachedMetaOut,
        brand_context: raw.brand_context ?? null,
        website_signals: raw.website_signals ?? null,
        tech_stack: raw.tech_stack ?? null,
        landing_page_signals: raw.landing_page_signals ?? null,
        growth_narrative: raw.growth_narrative ?? null,
        growth_prompt: raw.growth_prompt ?? null,
        cached: true,
        company,
      });
    }

    // Run Meta Ads fetch + homepage crawl in parallel
    let meta: MetaAdsSignals | null = null;
    let crawlResult: Awaited<ReturnType<typeof crawlHomepage>> | null = null;
    let crawlError: string | null = null;

    const [metaSettled, crawlSettled] = await Promise.allSettled([
      company.facebook_url && process.env.APIFY_TOKEN
        ? fetchMetaAdsSignals(company.facebook_url, company.domain)
        : Promise.resolve(null),
      crawlHomepage(company.domain),
    ]);

    if (metaSettled.status === 'fulfilled') {
      meta = metaSettled.value;
    } else {
      logger.error('Meta Ads fetch failed — falling back to heuristic scoring', {
        error:
          metaSettled.reason instanceof Error
            ? metaSettled.reason.message
            : String(metaSettled.reason),
      });
    }

    if (crawlSettled.status === 'fulfilled') {
      crawlResult = crawlSettled.value;
    } else {
      crawlError =
        crawlSettled.reason instanceof Error
          ? crawlSettled.reason.message
          : String(crawlSettled.reason);
      logger.error('Homepage crawl failed', { error: crawlError });
    }

    const analysis = computeScores(company, meta);
    const metaOut = metaAdsResponse(meta, analysis.ad_activity_level);
    const campaignThemes = inferCampaignThemes(meta?.unique_landing_pages ?? []);
    const landingPageSignals = { campaign_themes: campaignThemes };

    // Generate narrative — uses Claude when ANTHROPIC_API_KEY is set,
    // otherwise a deterministic template. Never throws.
    let growth_narrative: string | null = null;
    let growth_prompt: string | null = null;

    try {
      const narrative = await generateNarrative({
        domain: company.domain,
        platform: company.platform,
        categories: company.categories,
        company_location: company.company_location,
        estimated_yearly_sales: company.estimated_yearly_sales,
        combined_followers: company.combined_followers,
        meta,
        brand_context: crawlResult?.brand_context ?? null,
        website_signals: crawlResult?.website_signals ?? null,
        tech_stack: crawlResult?.tech_stack ?? [],
        campaign_themes: campaignThemes,
      });
      growth_narrative = narrative.growth_narrative;
      growth_prompt = narrative.growth_prompt;
    } catch (err) {
      logger.error('Narrative generation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const { error: insertError } = await supabase.from('domain_analyses').insert({
      domain: company.domain,
      master_database_id: company.id,
      growth_score: analysis.growth_score,
      northbeam_fit_score: analysis.northbeam_fit_score,
      paid_media_signal: analysis.paid_media_signal,
      recommended_buyer: analysis.recommended_buyer,
      recommended_angle: analysis.recommended_angle,
      outbound_hook: analysis.outbound_hook,
      reasons: analysis.reasons,
      raw_response: {
        method: meta ? 'apify-meta-ads-v1' : 'heuristic-fallback-v1',
        inputs: company,
        meta_ads: metaOut,
        apify_raw: meta?.raw ?? null,
        brand_context: crawlResult?.brand_context ?? null,
        website_signals: crawlResult?.website_signals ?? null,
        tech_stack: crawlResult?.tech_stack ?? null,
        landing_page_signals: landingPageSignals,
        crawl_error: crawlError,
        growth_narrative,
        growth_prompt,
      },
    });

    if (insertError) {
      logger.error('Failed to insert domain analysis', { error: insertError.message });
    }

    return NextResponse.json({
      domain: company.domain,
      growth_score: analysis.growth_score,
      northbeam_fit_score: analysis.northbeam_fit_score,
      paid_media_signal: analysis.paid_media_signal,
      recommended_buyer: analysis.recommended_buyer,
      recommended_angle: analysis.recommended_angle,
      outbound_hook: analysis.outbound_hook,
      reasons: analysis.reasons,
      meta_ads: metaOut,
      brand_context: crawlResult?.brand_context ?? null,
      website_signals: crawlResult?.website_signals ?? null,
      tech_stack: crawlResult?.tech_stack ?? null,
      landing_page_signals: landingPageSignals,
      crawl_error: crawlError,
      growth_narrative,
      growth_prompt,
      cached: false,
      company,
    });
  } catch (err) {
    logger.error('analyze-domain failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
