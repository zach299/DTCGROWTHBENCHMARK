import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain, domainCandidates } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';
import { fetchMetaAdsSignals, type MetaAdsSignals } from '@/lib/providers/apifyMetaAds';
import { analyzeCreativeQuality } from '@/lib/creativeQuality';
import {
  crawlHomepage,
  inferCampaignThemes,
  type BrandContext,
  type WebsiteSignals,
  type DetectedTech,
} from '@/lib/providers/crawlHomepage';
import { generateNarrative } from '@/lib/providers/generateNarrative';
import {
  fetchGoogleAds,
  fetchLinkedInAds,
  type AdPlatformResult,
} from '@/lib/providers/adLibraries';
import { writeSnapshot, getTrends, getTimeline, type SnapshotMetrics } from '@/lib/trends';
import { computeMomentum, revenueRange } from '@/lib/intelligence';
import { buildResearchBrief } from '@/lib/researchBrief';

// Cache TTL: ad data (Meta/Google/LinkedIn) is considered fresh for 7 days.
const CACHE_TTL_DAYS = 7;

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

// Build snapshot metrics + persist a daily snapshot, then compute trends + timeline.
async function snapshotAndTrends(
  supabase: ReturnType<typeof createServiceClient>,
  domain: string,
  vals: {
    active_meta_ads: number;
    active_google_ads: number;
    active_linkedin_ads: number;
    landing_pages_count: number;
    estimated_revenue: number;
    revenue_range: string;
    growth_score: number;
    growth_momentum: string;
    paid_media_intensity: string;
  },
  rawMeta: unknown
) {
  const metrics: SnapshotMetrics = {
    active_meta_ads: vals.active_meta_ads,
    active_google_ads: vals.active_google_ads,
    active_linkedin_ads: vals.active_linkedin_ads,
    landing_pages_count: vals.landing_pages_count,
    estimated_revenue: vals.estimated_revenue,
    revenue_range: vals.revenue_range,
    growth_score: vals.growth_score,
    growth_momentum: vals.growth_momentum,
    paid_media_intensity: vals.paid_media_intensity,
    creative_velocity: velocityLabel(vals.active_meta_ads),
    campaign_diversity: diversityLabel(vals.landing_pages_count),
  };
  await writeSnapshot(supabase, domain, metrics, rawMeta);
  const [trends, timeline] = await Promise.all([
    getTrends(supabase, domain, {
      active_meta_ads: vals.active_meta_ads,
      landing_pages_count: vals.landing_pages_count,
      growth_score: vals.growth_score,
    }),
    getTimeline(supabase, domain),
  ]);
  return { trends, timeline };
}

// Apify run-sync can take up to ~2 minutes; allow generous function duration.
// Note: Vercel hobby plan caps maxDuration lower (60s) — this takes effect on Pro+.
export const maxDuration = 300;

const bodySchema = z.object({
  domain: z.string().min(1),
  lens: z.string().optional(),
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
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1_000)}K`;
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
    growth_score >= 70
      ? 'VP Growth / Head of Performance Marketing'
      : growth_score >= 40
        ? 'Director of Marketing / Growth Lead'
        : 'Founder / Head of Marketing';

  const category = company.categories?.split(/[,;|/]/)[0]?.trim() || 'DTC';
  const recommended_angle =
    adsCount >= 50
      ? `Incrementality and measurement — at ${adsCount} live creatives, they need to know which campaigns are truly driving revenue, not just optimizing for modeled conversions.`
      : activity === 'high' || activity === 'medium'
        ? 'Measurement + incrementality to protect ROAS as they scale paid channels'
        : `Help their ${category} brand build a measurable acquisition engine — right now attribution is likely guesswork at their stage.`;

  let outbound_hook: string;
  if (meta && adsCount >= 10) {
    outbound_hook = `Noticed ${meta.advertiser_name ?? company.domain} is running ${adsCount} active Meta ads across ${landingPagesCount} landing pages — at that volume, knowing which campaigns are truly incremental is the difference between scaling efficiently and burning budget.`;
  } else if (meta && adsCount > 0) {
    outbound_hook = `${meta.advertiser_name ?? company.domain} has ${adsCount} active Meta ads — an early signal they're investing in paid acquisition. The question is whether they have the measurement infrastructure to scale it efficiently.`;
  } else {
    const followerHook =
      followers > 0
        ? `With ${followers.toLocaleString()} combined social followers`
        : `As a growing ${company.platform || 'DTC'} brand`;
    outbound_hook = `${followerHook}, ${company.domain} is building toward a paid acquisition program — getting measurement right before scaling is what separates brands that grow efficiently from those that overspend to learn.`;
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
  server_side_signals?: string[] | null;
  ad_platforms?: AdPlatformResult[] | null;
  landing_page_signals?: { campaign_themes: string[] } | null;
  growth_narrative?: string | null;
  growth_prompt?: string | null;
  growth_momentum?: string | null;
  revenue_range?: string | null;
  revenue_confidence?: string | null;
  research_brief?: string | null;
  paid_media_quality?: unknown;
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
    // master_database stores domains inconsistently (bare / www. / http(s)://
    // / trailing slash) — match any common form.
    const candidates = domainCandidates(rawDomain);
    const lookup = await supabase
      .from('master_database')
      .select('*')
      .in('domain', candidates)
      .limit(1);

    if (lookup.error) {
      logger.error('master_database lookup failed', { error: lookup.error.message });
      return NextResponse.json(
        { error: `Database lookup failed: ${lookup.error.message}` },
        { status: 500 }
      );
    }

    // Not in the Store Leads DB? Synthesize a minimal company so any domain can
    // still be analyzed (Meta/Google/LinkedIn/website work from the domain).
    const company: MasterRow =
      (lookup.data?.[0] as MasterRow) ?? {
        id: null as unknown as number,
        domain,
        average_product_price: null,
        categories: null,
        combined_followers: null,
        company_location: null,
        estimated_yearly_sales: null,
        facebook_url: null,
        instagram_url: null,
        platform: null,
        tiktok_url: null,
      };
    const inDb = (company.id as number | null) != null;
    // Normalize the stored domain (some rows have www./protocol) so downstream
    // crawl + ad-library URLs and snapshot keys are clean and consistent.
    company.domain = normalizeDomain(company.domain);

    // Check cache
    const { data: cached } = await supabase
      .from('domain_analyses')
      .select('*')
      .eq('master_database_id', company.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const cacheAgeDays = cached?.created_at
      ? (Date.now() - new Date(cached.created_at).getTime()) / 86_400_000
      : Infinity;
    const cacheFresh = Boolean(cached) && cacheAgeDays <= CACHE_TTL_DAYS;

    // Serve a fresh cache hit immediately (fast path). Stale cache falls through
    // to re-enrichment below so ad data refreshes on the 7-day TTL.
    if (cached && cacheFresh) {
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

      const cMetaAds = Number(cachedMeta?.active_ads_count ?? 0);
      const cLanding = Array.isArray(cachedMeta?.unique_landing_pages)
        ? (cachedMeta!.unique_landing_pages as unknown[]).length
        : 0;
      const platformCount = (name: string): number => {
        const p = (raw.ad_platforms ?? []).find((x) => x?.platform === name);
        return p && p.status === 'active' ? Number(p.ads_count ?? 0) : 0;
      };
      const cGoogle = platformCount('Google');
      const cLinkedin = platformCount('LinkedIn');
      const cSales = parseNumeric(company.estimated_yearly_sales);
      const cThemes = Array.isArray(raw.landing_page_signals?.campaign_themes)
        ? raw.landing_page_signals!.campaign_themes.length
        : 0;

      // Prefer stored intelligence; recompute for legacy cached rows.
      const cMomentum =
        raw.growth_momentum ??
        computeMomentum({
          metaAds: cMetaAds,
          googleAds: cGoogle,
          linkedinAds: cLinkedin,
          landingPages: cLanding,
          campaignDiversity: cThemes,
          revenue: cSales,
          paidIntensity: String(cached.paid_media_signal ?? 'low'),
        }).label;
      const cRevenue = raw.revenue_range ?? revenueRange(cSales).range;
      const cConfidence = raw.revenue_confidence ?? revenueRange(cSales).confidence;

      const { trends, timeline } = await snapshotAndTrends(
        supabase,
        company.domain,
        {
          active_meta_ads: cMetaAds,
          active_google_ads: cGoogle,
          active_linkedin_ads: cLinkedin,
          landing_pages_count: cLanding,
          estimated_revenue: cSales,
          revenue_range: cRevenue,
          growth_score: Number(cached.growth_score ?? 0),
          growth_momentum: cMomentum,
          paid_media_intensity: String(cached.paid_media_signal ?? 'low'),
        },
        raw.apify_raw ?? null
      );

      return NextResponse.json({
        domain: company.domain,
        growth_score: cached.growth_score,
        growth_momentum: cMomentum,
        paid_media_signal: cached.paid_media_signal,
        revenue_range: cRevenue,
        revenue_confidence: cConfidence,
        recommended_buyer: cached.recommended_buyer,
        recommended_angle: cached.recommended_angle,
        outbound_hook: cached.outbound_hook,
        reasons: cached.reasons,
        meta_ads: cachedMetaOut,
        brand_context: raw.brand_context ?? null,
        website_signals: raw.website_signals ?? null,
        tech_stack: raw.tech_stack ?? null,
        server_side_signals: raw.server_side_signals ?? null,
        ad_platforms: raw.ad_platforms ?? null,
        landing_page_signals: raw.landing_page_signals ?? null,
        growth_narrative: raw.growth_narrative ?? null,
        growth_prompt: raw.growth_prompt ?? null,
        research_brief: raw.research_brief ?? null,
        paid_media_quality: raw.paid_media_quality ?? null,
        trends,
        timeline,
        cache_age_days: Math.round(cacheAgeDays * 10) / 10,
        cached: true,
        company,
      });
    }

    // Run Meta Ads + homepage crawl + Google/LinkedIn ad libraries in parallel.
    let meta: MetaAdsSignals | null = null;
    let crawlResult: Awaited<ReturnType<typeof crawlHomepage>> | null = null;
    let crawlError: string | null = null;
    let metaError: string | null = process.env.APIFY_TOKEN ? null : 'APIFY_TOKEN not set';

    // Strip a leading "www." so ad-library lookups search the real brand
    // (e.g. www.amazon.com -> amazon.com / "amazon", not "www").
    const cleanDomain = company.domain.replace(/^www\./i, '');
    const brandName = cleanDomain.split('.')[0];

    const [metaSettled, crawlSettled, googleSettled, linkedinSettled] =
      await Promise.allSettled([
        process.env.APIFY_TOKEN
          ? fetchMetaAdsSignals(company.facebook_url, company.domain)
          : Promise.resolve(null),
        crawlHomepage(company.domain),
        fetchGoogleAds(cleanDomain),
        fetchLinkedInAds(cleanDomain, brandName),
      ]);

    if (metaSettled.status === 'fulfilled') {
      meta = metaSettled.value;
      if (meta && meta.active_ads_count === 0) {
        metaError = `page resolved (${meta.advertiser_name ?? '?'}) but 0 active ads returned`;
      }
    } else {
      metaError =
        metaSettled.reason instanceof Error
          ? metaSettled.reason.message
          : String(metaSettled.reason);
      logger.error('Meta Ads fetch failed — falling back to heuristic scoring', {
        error: metaError,
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

    // The live Meta scrape is non-deterministic — the page-scoped query can
    // intermittently return 0 even for brands that clearly advertise. When that
    // happens, fall back to the most recent stored bulk signal so the profile
    // stays consistent with the Top Movers leaderboard instead of showing a
    // false 0. (Only trust plausible counts; ignore pre-fix contamination.)
    if (!meta || meta.active_ads_count === 0) {
      try {
        const { data: stored } = await supabase
          .from('company_meta_signals')
          .select('active_meta_ads, company_name, landing_pages, sample_ad_copy, first_seen_date, last_enriched_at')
          .eq('domain', cleanDomain)
          .maybeSingle();
        const storedCount = Number(stored?.active_meta_ads ?? 0);
        if (storedCount > 0 && storedCount < 13000) {
          meta = {
            advertiser_name: (stored?.company_name as string) ?? meta?.advertiser_name ?? null,
            active_ads_count: storedCount,
            unique_landing_pages: Array.isArray(stored?.landing_pages) ? (stored!.landing_pages as string[]) : [],
            sample_ad_copy: Array.isArray(stored?.sample_ad_copy) ? (stored!.sample_ad_copy as string[]) : [],
            sample_creatives: [],
            first_seen_date: (stored?.first_seen_date as string) ?? null,
            platforms: [],
            raw: meta?.raw ?? [],
          };
          metaError = null;
        }
      } catch {
        /* fallback is best-effort */
      }
    }

    const analysis = computeScores(company, meta);
    const metaOut = metaAdsResponse(meta, analysis.ad_activity_level);
    const campaignThemes = inferCampaignThemes(meta?.unique_landing_pages ?? []);
    const landingPageSignals = { campaign_themes: campaignThemes };

    // Paid Media Quality — separate genuine creative from catalog/DPA volume.
    const qGoogle = googleSettled.status === 'fulfilled' ? Number(googleSettled.value?.ads_count ?? 0) : 0;
    const qLinkedin = linkedinSettled.status === 'fulfilled' ? Number(linkedinSettled.value?.ads_count ?? 0) : 0;
    const paid_media_quality = meta
      ? analyzeCreativeQuality(
          meta.raw,
          meta.active_ads_count,
          meta.unique_landing_pages,
          1 + (qGoogle > 0 ? 1 : 0) + (qLinkedin > 0 ? 1 : 0)
        )
      : null;

    // Unified Ad Platforms view (Meta from the Ad Library, Google + LinkedIn
    // from their transparency libraries). This is the authoritative source for
    // which platforms a brand actually advertises on.
    const metaPlatform: AdPlatformResult = {
      platform: 'Meta',
      status: meta ? (meta.active_ads_count > 0 ? 'active' : 'none') : 'unknown',
      ads_count: meta?.active_ads_count ?? null,
      sample_ad_copy: meta?.sample_ad_copy ?? [],
      sample_creatives: meta?.sample_creatives ?? [],
      library_url: meta
        ? `https://www.facebook.com/ads/library/?active_status=active&country=US&q=${encodeURIComponent(
            meta.advertiser_name ?? brandName
          )}`
        : null,
    };
    const googlePlatform =
      googleSettled.status === 'fulfilled'
        ? googleSettled.value
        : ({
            platform: 'Google',
            status: 'unknown',
            ads_count: null,
            sample_ad_copy: [],
            sample_creatives: [],
            library_url: null,
          } as AdPlatformResult);
    const linkedinPlatform =
      linkedinSettled.status === 'fulfilled'
        ? linkedinSettled.value
        : ({
            platform: 'LinkedIn',
            status: 'unknown',
            ads_count: null,
            sample_ad_copy: [],
            sample_creatives: [],
            library_url: null,
          } as AdPlatformResult);
    const adPlatforms: AdPlatformResult[] = [metaPlatform, googlePlatform, linkedinPlatform];

    // Tech stack from homepage fingerprints (Backend / Measurement / Lifecycle).
    // Ad platforms now come from the ad libraries above, not pixel inference.
    const techStack: DetectedTech[] = crawlResult?.tech_stack
      ? [...crawlResult.tech_stack]
      : [];

    // --- Phase 4 intelligence: Growth Momentum + revenue range + research brief ---
    const googleCount = googlePlatform.status === 'active' ? googlePlatform.ads_count ?? 0 : 0;
    const linkedinCount = linkedinPlatform.status === 'active' ? linkedinPlatform.ads_count ?? 0 : 0;
    const salesNum = parseNumeric(company.estimated_yearly_sales);
    const followersNum = parseNumeric(company.combined_followers);
    const momentum = computeMomentum({
      metaAds: meta?.active_ads_count ?? 0,
      googleAds: googleCount,
      linkedinAds: linkedinCount,
      landingPages: meta?.unique_landing_pages.length ?? 0,
      campaignDiversity: campaignThemes.length,
      revenue: salesNum,
      paidIntensity: analysis.paid_media_signal,
    });
    const revenue = revenueRange(salesNum, salesNum > 0 && followersNum > 0);
    const research_brief = buildResearchBrief({
      brandName: meta?.advertiser_name ?? company.domain.replace(/^www\./i, '').split('.')[0],
      domain: company.domain,
      category: company.categories,
      location: company.company_location,
      revenueRange: revenue.range,
      revenueConfidence: revenue.confidence,
      momentum: momentum.label,
      paidIntensity: analysis.paid_media_signal,
      metaAds: meta?.active_ads_count ?? 0,
      googleAds: googleCount,
      linkedinAds: linkedinCount,
      landingPages: meta?.unique_landing_pages ?? [],
      campaignThemes,
      sampleAdCopy: meta?.sample_ad_copy ?? [],
      positioning:
        crawlResult?.brand_context?.hero_subheadline ??
        crawlResult?.brand_context?.meta_description ??
        null,
      techStack,
      serverSide: crawlResult?.server_side_signals ?? [],
      websiteSignals: crawlResult?.website_signals ?? null,
      quality: paid_media_quality
        ? {
            realCreativeScore: paid_media_quality.real_creative_score,
            dpaShare: paid_media_quality.dpa_share,
            uniqueCreatives: paid_media_quality.unique_creative_count,
            campaignAngles: paid_media_quality.campaign_angle_count,
            offerDiversity: paid_media_quality.offer_diversity,
            landingPageDiversity: paid_media_quality.landing_page_diversity,
          }
        : null,
    }, parsed.data.lens);

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
        tech_stack: techStack,
        server_side_signals: crawlResult?.server_side_signals ?? [],
        ad_platforms: adPlatforms,
        campaign_themes: campaignThemes,
      });
      growth_narrative = narrative.growth_narrative;
      growth_prompt = narrative.growth_prompt;
    } catch (err) {
      logger.error('Narrative generation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Only cache to domain_analyses for companies that exist in master_database
    // (the table keys on master_database_id). Out-of-DB domains skip the cache
    // but still get snapshots (keyed by domain).
    const { error: insertError } = inDb
      ? await supabase.from('domain_analyses').insert({
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
        tech_stack: techStack,
        server_side_signals: crawlResult?.server_side_signals ?? null,
        ad_platforms: adPlatforms,
        landing_page_signals: landingPageSignals,
        crawl_error: crawlError,
        crawl_source: crawlResult?.crawl_source ?? null,
        crawl_html_len: crawlResult?.crawl_html_len ?? null,
        crawl_note: crawlResult?.crawl_note ?? null,
        meta_error: metaError,
        growth_narrative,
        growth_prompt,
        growth_momentum: momentum.label,
        momentum_score: momentum.score,
        revenue_range: revenue.range,
        revenue_confidence: revenue.confidence,
        research_brief,
        paid_media_quality,
      },
    })
      : { error: null };

    if (insertError) {
      logger.error('Failed to insert domain analysis', { error: insertError.message });
    }

    // Persist a daily snapshot and compute historical trends + timeline.
    const { trends, timeline } = await snapshotAndTrends(
      supabase,
      company.domain,
      {
        active_meta_ads: meta?.active_ads_count ?? 0,
        active_google_ads: googleCount,
        active_linkedin_ads: linkedinCount,
        landing_pages_count: meta?.unique_landing_pages.length ?? 0,
        estimated_revenue: salesNum,
        revenue_range: revenue.range,
        growth_score: analysis.growth_score,
        growth_momentum: momentum.label,
        paid_media_intensity: analysis.paid_media_signal,
      },
      meta?.raw ?? null
    );

    return NextResponse.json({
      domain: company.domain,
      growth_score: analysis.growth_score,
      growth_momentum: momentum.label,
      momentum_score: momentum.score,
      paid_media_signal: analysis.paid_media_signal,
      revenue_range: revenue.range,
      revenue_confidence: revenue.confidence,
      recommended_buyer: analysis.recommended_buyer,
      recommended_angle: analysis.recommended_angle,
      outbound_hook: analysis.outbound_hook,
      reasons: analysis.reasons,
      meta_ads: metaOut,
      brand_context: crawlResult?.brand_context ?? null,
      website_signals: crawlResult?.website_signals ?? null,
      tech_stack: techStack,
      server_side_signals: crawlResult?.server_side_signals ?? null,
      ad_platforms: adPlatforms,
      landing_page_signals: landingPageSignals,
      crawl_error: crawlError,
      crawl_source: crawlResult?.crawl_source ?? null,
      crawl_html_len: crawlResult?.crawl_html_len ?? null,
      crawl_note: crawlResult?.crawl_note ?? null,
      meta_error: metaError,
      growth_narrative,
      growth_prompt,
      research_brief,
      paid_media_quality,
      trends,
      timeline,
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
