import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/lib/utils/logger';
import type { BrandContext, WebsiteSignals } from './crawlHomepage';
import type { MetaAdsSignals } from './apifyMetaAds';

export interface NarrativeResult {
  growth_narrative: string;
  growth_prompt: string;
}

interface NarrativeInput {
  domain: string;
  platform: string | null;
  categories: string | null;
  company_location: string | null;
  estimated_yearly_sales: string | null;
  combined_followers: string | null;
  meta: MetaAdsSignals | null;
  brand_context: BrandContext | null;
  website_signals: WebsiteSignals | null;
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

export async function generateNarrative(input: NarrativeInput): Promise<NarrativeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const client = new Anthropic({ apiKey });
  const contextBlock = buildContextBlock(input);

  const systemPrompt = `You are a GTM intelligence analyst helping B2B sales teams at Northbeam prepare account research for DTC e-commerce brands. Be concise, specific, and intelligence-led. Avoid generic filler. Focus on what the signals actually reveal about the company's growth trajectory and pain points.`;

  const userPrompt = `Here is the intelligence gathered on ${input.domain}:

${contextBlock}

Write a Growth Narrative (2–4 sentences) that synthesizes what the company sells, how they position themselves, how they appear to be acquiring customers, and signals they are scaling or have attribution complexity.

Respond with ONLY the narrative paragraph — no headers, no bullet points, no extra commentary.`;

  logger.info('Generating growth narrative', { domain: input.domain });

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  });

  const growth_narrative =
    message.content[0].type === 'text' ? message.content[0].text.trim() : '';

  // Build the growth prompt (copyable block for the user to paste into Claude/ChatGPT)
  const growth_prompt = `You are a GTM intelligence assistant helping a sales team at Northbeam prepare for outreach to ${input.domain}.

## Company Intelligence

${contextBlock}

## Growth Narrative

${growth_narrative}
${GROWTH_PROMPT_SUFFIX}`;

  return { growth_narrative, growth_prompt };
}
