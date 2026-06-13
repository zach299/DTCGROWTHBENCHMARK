export interface ScoreInput {
  domain: string;
  company_name?: string;
  country?: string;
  category?: string;
  ecommerce_platform?: string;
  estimated_revenue?: string;
  estimated_sales?: string;
  estimated_traffic?: string;
  social_profiles?: Array<{
    platform: string;
    followers?: number;
    followers_30d?: number;
    posts?: number;
    url?: string;
  }>;
  ad_snapshot?: {
    active_ads_count?: number;
    new_ads_7d?: number;
    new_ads_30d?: number;
    landing_pages?: string[];
    creative_angles?: string[];
    sample_ads?: unknown[];
  } | null;
  site_snapshot?: {
    homepage_title?: string;
    homepage_description?: string;
    detected_tech?: Record<string, boolean>;
    promo_text?: string;
  } | null;
  hiring_snapshot?: {
    jobs_count?: number;
    growth_jobs_count?: number;
    roles?: string[];
    careers_url?: string;
  } | null;
}

export interface ScoreOutput {
  score: number;
  paid_media_signal: 'low' | 'medium' | 'high' | 'unknown';
  social_signal: 'low' | 'medium' | 'high' | 'unknown';
  hiring_signal: 'low' | 'medium' | 'high' | 'unknown';
  site_signal: 'low' | 'medium' | 'high' | 'unknown';
  summary: string;
  recommended_buyer: string;
  recommended_angle: string;
  outbound_hook: string;
  reasons: string[];
}

export const SYSTEM_PROMPT = `You are scoring ecommerce brands for GTM prioritization.
The score should estimate whether the company appears to be in a growth/scaling phase and worth outbounding.

Scoring factors:
- High active ad count is a strong paid media signal.
- Increasing ad count / new ad velocity is very strong.
- Multiple landing pages indicate funnel testing.
- Hiring for growth/performance/lifecycle roles is strong.
- Social follower growth is moderate signal.
- Shopify Plus / modern ecommerce stack is useful but not enough alone.
- Estimated revenue/category can inform ICP fit but should not dominate.
- Do not invent facts not present in the data.
- If data is missing, say "unknown" and score conservatively.
- Return strict JSON only. No markdown, no explanation outside JSON.

Return this exact JSON schema:
{
  "score": <integer 0-100>,
  "paid_media_signal": "low" | "medium" | "high" | "unknown",
  "social_signal": "low" | "medium" | "high" | "unknown",
  "hiring_signal": "low" | "medium" | "high" | "unknown",
  "site_signal": "low" | "medium" | "high" | "unknown",
  "summary": "<2-3 sentence summary of growth signals>",
  "recommended_buyer": "<job title / persona most likely to buy your service>",
  "recommended_angle": "<GTM angle / value prop most relevant to this brand>",
  "outbound_hook": "<1 sentence personalized cold outreach opener>",
  "reasons": ["<reason 1>", "<reason 2>", "...up to 7 reasons"]
}`;

export function buildScorePrompt(input: ScoreInput): string {
  return `Score this ecommerce brand for GTM prioritization:

Domain: ${input.domain}
Company: ${input.company_name ?? 'unknown'}
Country: ${input.country ?? 'unknown'}
Category: ${input.category ?? 'unknown'}
Platform: ${input.ecommerce_platform ?? 'unknown'}
Est. Revenue: ${input.estimated_revenue ?? 'unknown'}
Est. Sales: ${input.estimated_sales ?? 'unknown'}
Est. Traffic: ${input.estimated_traffic ?? 'unknown'}

Social Profiles:
${
  input.social_profiles && input.social_profiles.length > 0
    ? input.social_profiles
        .map(
          (p) =>
            `  ${p.platform}: followers=${p.followers ?? 'unknown'}, followers_30d=${p.followers_30d ?? 'unknown'}, posts=${p.posts ?? 'unknown'}`
        )
        .join('\n')
    : '  None found'
}

Ad Signals (Meta):
${
  input.ad_snapshot
    ? `  Active ads: ${input.ad_snapshot.active_ads_count ?? 'unknown'}
  New ads (7d): ${input.ad_snapshot.new_ads_7d ?? 'unknown'}
  New ads (30d): ${input.ad_snapshot.new_ads_30d ?? 'unknown'}
  Landing pages tested: ${input.ad_snapshot.landing_pages?.length ?? 'unknown'}
  Creative angles: ${input.ad_snapshot.creative_angles?.join(', ') ?? 'unknown'}`
    : '  No ad data available'
}

Site Signals:
${
  input.site_snapshot
    ? `  Title: ${input.site_snapshot.homepage_title ?? 'unknown'}
  Description: ${input.site_snapshot.homepage_description ?? 'unknown'}
  Detected tech: ${input.site_snapshot.detected_tech ? Object.entries(input.site_snapshot.detected_tech).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none detected' : 'unknown'}
  Promo text: ${input.site_snapshot.promo_text ?? 'none'}`
    : '  No site data available'
}

Hiring Signals:
${
  input.hiring_snapshot
    ? `  Total jobs: ${input.hiring_snapshot.jobs_count ?? 'unknown'}
  Growth-related jobs: ${input.hiring_snapshot.growth_jobs_count ?? 'unknown'}
  Roles: ${input.hiring_snapshot.roles?.slice(0, 10).join(', ') ?? 'unknown'}`
    : '  No hiring data available'
}

Return strict JSON only.`;
}
