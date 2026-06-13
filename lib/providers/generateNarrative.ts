import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/lib/utils/logger';
import type { BrandContext, WebsiteSignals, DetectedTech } from './crawlHomepage';
import type { MetaAdsSignals } from './apifyMetaAds';
import type { AdPlatformResult } from './adLibraries';

export interface NarrativeResult {
  growth_narrative: string;
  growth_prompt: string;
}

export interface NarrativeInput {
  domain: string;
  platform: string | null;
  categories: string | null;
  company_location: string | null;
  estimated_yearly_sales: string | null;
  combined_followers: string | null;
  meta: MetaAdsSignals | null;
  brand_context: BrandContext | null;
  website_signals: WebsiteSignals | null;
  tech_stack: DetectedTech[];
  server_side_signals: string[];
  ad_platforms: AdPlatformResult[];
  campaign_themes: string[];
}

function buildContextBlock(input: NarrativeInput): string {
  const lines: string[] = [];

  lines.push(`Domain: ${input.domain}`);
  if (input.platform) lines.push(`Platform: ${input.platform}`);
  if (input.categories) lines.push(`Categories: ${input.categories}`);
  if (input.company_location) lines.push(`Location: ${input.company_location}`);
  if (input.estimated_yearly_sales)
    lines.push(`Estimated Yearly Sales: ${input.estimated_yearly_sales}`);
  if (input.combined_followers)
    lines.push(`Combined Social Followers: ${input.combined_followers}`);

  // Authoritative ad-platform activity from the ad libraries.
  const activePlatforms = input.ad_platforms.filter((p) => p.status === 'active');
  if (activePlatforms.length) {
    lines.push('');
    lines.push(
      `Active Ad Platforms: ${activePlatforms
        .map((p) => (p.ads_count != null ? `${p.platform} (${p.ads_count} ads)` : p.platform))
        .join(', ')}`
    );
  }

  if (input.meta) {
    lines.push('');
    lines.push(`Active Meta Ads: ${input.meta.active_ads_count}`);
    if (input.meta.platforms.length)
      lines.push(`Ad Platforms: ${input.meta.platforms.join(', ')}`);
    if (input.meta.unique_landing_pages.length) {
      lines.push(
        `Top Landing Pages:\n${input.meta.unique_landing_pages
          .slice(0, 8)
          .map((u) => `  - ${u}`)
          .join('\n')}`
      );
    }
    if (input.meta.sample_ad_copy.length) {
      lines.push(
        `Sample Ad Copy:\n${input.meta.sample_ad_copy
          .slice(0, 3)
          .map((c) => `  - "${c}"`)
          .join('\n')}`
      );
    }
    if (input.meta.first_seen_date) {
      lines.push(`First Ad Seen: ${input.meta.first_seen_date.slice(0, 10)}`);
    }
  } else {
    lines.push('Meta Ads: No data available');
  }

  if (input.brand_context) {
    const bc = input.brand_context;
    lines.push('');
    if (bc.seo_title) lines.push(`SEO Title: ${bc.seo_title}`);
    if (bc.meta_description) lines.push(`Meta Description: ${bc.meta_description}`);
    if (bc.hero_headline) lines.push(`Hero Headline: ${bc.hero_headline}`);
    if (bc.hero_subheadline) lines.push(`Hero Subheadline: ${bc.hero_subheadline}`);
  }

  if (input.website_signals) {
    const ws = input.website_signals;
    const signalLines: string[] = [];
    if (ws.subscription) signalLines.push('Subscription / Subscribe-and-Save: YES');
    if (ws.affiliate_program) signalLines.push('Affiliate / Ambassador Program: YES');
    if (ws.retail_presence) signalLines.push('Retail / Wholesale Presence: YES');
    if (ws.international) signalLines.push('International / Multi-currency: YES');
    if (ws.careers_active) {
      const roles =
        ws.careers_roles.length ? ` (roles: ${ws.careers_roles.join(', ')})` : '';
      signalLines.push(`Careers Page Active: YES${roles}`);
    }
    if (signalLines.length) {
      lines.push('');
      lines.push('Website Signals:');
      signalLines.forEach((s) => lines.push(`  - ${s}`));
    }
  }

  if (input.tech_stack.length) {
    lines.push('');
    lines.push('Detected Tech Stack:');
    input.tech_stack.forEach((t) => lines.push(`  - ${t.name} (${t.category})`));
  }

  if (input.server_side_signals.length) {
    lines.push('');
    lines.push('Server-Side / CAPI Infrastructure:');
    input.server_side_signals.forEach((s) => lines.push(`  - ${s}`));
  }

  if (input.campaign_themes.length) {
    lines.push('');
    lines.push(`Campaign Themes: ${input.campaign_themes.join(', ')}`);
  }

  return lines.join('\n');
}

const GROWTH_PROMPT_SUFFIX = `\n\nBased on the above information, generate:
1. Personalized outbound email
2. LinkedIn message
3. Discovery hypotheses
4. Likely business challenges
5. Recommended GTM angle`;

function parseNumeric(value: string | null): number {
  if (!value) return 0;
  const n = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  if (n <= 0) return '';
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1_000)}K`;
}

/**
 * Deterministic, no-API narrative. Used when ANTHROPIC_API_KEY is unset or the
 * API call fails, so the Growth Narrative section is never empty.
 */
export function templateNarrative(input: NarrativeInput): string {
  const name =
    input.meta?.advertiser_name ?? input.domain.replace(/\.(com|co|io|shop|store).*$/i, '');
  const category =
    input.categories
      ?.split(/[,;|/]/)
      .map((c) => c.trim())
      .find(Boolean) || 'direct-to-consumer';
  const ads = input.meta?.active_ads_count ?? 0;
  const landingPages = input.meta?.unique_landing_pages.length ?? 0;
  const sales = parseNumeric(input.estimated_yearly_sales);
  const followers = parseNumeric(input.combined_followers);

  const sentences: string[] = [];

  // 1. What they sell + positioning
  const positioning =
    input.brand_context?.hero_subheadline ||
    input.brand_context?.meta_description ||
    input.brand_context?.hero_headline;
  if (positioning) {
    sentences.push(`${name} is a ${category} brand positioning itself around "${positioning.replace(/"/g, '').slice(0, 140)}".`);
  } else {
    sentences.push(`${name} is a ${category} brand.`);
  }

  // 2. Acquisition motion
  if (ads >= 50) {
    sentences.push(
      `They appear to be running a sophisticated paid acquisition program, with roughly ${ads} active Meta ads${landingPages >= 5 ? ` across ${landingPages}+ dedicated landing pages` : ''}${input.campaign_themes.length ? ` spanning ${input.campaign_themes.slice(0, 3).join(', ').toLowerCase()}` : ''}.`
    );
  } else if (ads >= 10) {
    sentences.push(
      `They are actively investing in Meta advertising, with around ${ads} live ads${landingPages >= 3 ? ` and ${landingPages} distinct landing pages` : ''}, indicating a structured paid acquisition motion.`
    );
  } else if (ads >= 1) {
    sentences.push(`They run a modest paid program with about ${ads} active Meta ad${ads === 1 ? '' : 's'}, suggesting paid social is an emerging rather than primary channel.`);
  } else {
    sentences.push(`No active Meta advertising was detected, suggesting customer acquisition leans on organic, retail, or other channels.`);
  }

  // 3. Scaling signals
  const scaleBits: string[] = [];
  if (sales > 0) scaleBits.push(`an estimated ${formatMoney(sales)} in yearly sales`);
  if (followers > 0) scaleBits.push(`${followers.toLocaleString()} combined social followers`);
  if (input.website_signals?.subscription) scaleBits.push('a subscription / subscribe-and-save offering');
  if (input.website_signals?.affiliate_program) scaleBits.push('an affiliate or ambassador program');
  if (input.website_signals?.retail_presence) scaleBits.push('retail / wholesale distribution');
  if (input.website_signals?.international) scaleBits.push('international expansion signals');
  if (input.website_signals?.careers_active) {
    scaleBits.push(
      input.website_signals.careers_roles.length
        ? `active hiring (${input.website_signals.careers_roles.slice(0, 3).join(', ')})`
        : 'an active careers page'
    );
  }
  if (scaleBits.length) {
    sentences.push(`Scaling indicators include ${scaleBits.slice(0, 4).join(', ')}.`);
  }

  // 4. Tech stack — dedicated measurement tooling is the displacement signal
  // (GA4 / GTM are baseline and don't count toward "already invests in MMM").
  const BASELINE = new Set(['GA4', 'Google Tag Manager']);
  const attribution = input.tech_stack.filter(
    (t) => t.category === 'Measurement' && !BASELINE.has(t.name)
  );
  // Authoritative ad-platform activity from the ad libraries.
  const adPlatforms = input.ad_platforms
    .filter((p) => p.status === 'active')
    .map((p) => p.platform);
  if (attribution.length) {
    sentences.push(
      `Their stack already includes ${attribution.map((t) => t.name).join(' and ')} for measurement${adPlatforms.length ? `, running paid media on ${adPlatforms.join(', ')}` : ''}.`
    );
  } else if (adPlatforms.length >= 2) {
    sentences.push(
      `They advertise across ${adPlatforms.join(', ')} but show no dedicated measurement platform in their stack.`
    );
  }

  // 4b. Server-side / CAPI infrastructure — strong qualification signal.
  if (input.server_side_signals.length) {
    sentences.push(
      `Evidence of server-side conversion tracking (${input.server_side_signals
        .map((s) => s.replace(/\s*\(.*\)$/, ''))
        .slice(0, 2)
        .join(', ')}) suggests they are already investing in durable, privacy-resilient measurement infrastructure.`
    );
  }

  // 5. GTM opportunity
  if (attribution.length) {
    sentences.push(
      `Since they already invest in measurement tooling, the opening is a displacement conversation around accuracy, incrementality, and consolidated reporting.`
    );
  } else if (ads >= 25 || landingPages >= 5) {
    sentences.push(
      `The combination of high creative volume and multiple landing pages points to growing attribution complexity and a likely need for stronger measurement and incrementality infrastructure.`
    );
  } else {
    sentences.push(
      `As they scale paid channels, the main GTM opportunity is helping them measure incrementality and attribute spend accurately before inefficiency compounds.`
    );
  }

  return sentences.join(' ');
}

export async function generateNarrative(input: NarrativeInput): Promise<NarrativeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const contextBlock = buildContextBlock(input);

  let growth_narrative = '';

  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey });
      const systemPrompt = `You are a GTM intelligence analyst helping B2B sales teams at Northbeam prepare account research for DTC e-commerce brands. Be concise, specific, and intelligence-led. Avoid generic filler. Focus on what the signals actually reveal about the company's growth trajectory and pain points.`;
      const userPrompt = `Here is the intelligence gathered on ${input.domain}:

${contextBlock}

Write a Growth Narrative (2–4 sentences) that synthesizes what the company sells, how they position themselves, how they appear to be acquiring customers, and signals they are scaling or have attribution complexity.

Respond with ONLY the narrative paragraph — no headers, no bullet points, no extra commentary.`;

      logger.info('Generating growth narrative via Claude', { domain: input.domain });

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      });

      growth_narrative =
        message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    } catch (err) {
      logger.error('Claude narrative failed — using template fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fall back to the deterministic narrative if the API is unavailable or empty.
  if (!growth_narrative) {
    growth_narrative = templateNarrative(input);
  }

  const growth_prompt = `You are a GTM intelligence assistant helping a sales team at Northbeam prepare for outreach to ${input.domain}.

## Company Intelligence

${contextBlock}

## Growth Narrative

${growth_narrative}
${GROWTH_PROMPT_SUFFIX}`;

  return { growth_narrative, growth_prompt };
}
