import { logger } from '@/lib/utils/logger';

export interface MetaAdsResult {
  active_ads_count: number;
  new_ads_7d: number | null;
  new_ads_30d: number | null;
  landing_pages: string[];
  creative_texts: string[];
  creative_angles: string[];
  sample_ads: unknown[];
  raw: unknown;
}

// TODO: Map these fields to match the actual Apify actor response shape
// Actor: https://apify.com/[actor-id]
// Run actor via Apify API and wait for result
async function runApifyActor(actorId: string, input: Record<string, unknown>): Promise<unknown> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');

  const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!runRes.ok) {
    const text = await runRes.text();
    throw new Error(`Apify run failed: ${runRes.status} ${text}`);
  }

  const runData = (await runRes.json()) as { data: { id: string } };
  const runId = runData.data.id;

  // Poll for completion (max 5 min)
  const maxWait = 300_000;
  const pollInterval = 5_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
    );
    const statusData = (await statusRes.json()) as { data: { status: string; defaultDatasetId: string } };
    const status = statusData.data.status;

    if (status === 'SUCCEEDED') {
      const datasetId = statusData.data.defaultDatasetId;
      const itemsRes = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`
      );
      return itemsRes.json();
    }

    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${runId} ended with status: ${status}`);
    }

    logger.info('Apify run still in progress', { runId, status, elapsedMs: Date.now() - start });
  }

  throw new Error(`Apify run ${runId} timed out after 5 minutes`);
}

// TODO: Adjust the input schema to match the actual Meta Ads Library actor's expected input
// Common actors: apify/facebook-ads-library-scraper or similar
function buildActorInput(domain: string, facebookUrl?: string): Record<string, unknown> {
  return {
    // TODO: Check actor docs for correct field names
    searchQuery: facebookUrl ?? domain,
    adType: 'ALL',
    country: 'US',
    maxResults: 50,
    ...(facebookUrl ? { pageUrl: facebookUrl } : { searchTerms: [domain] }),
  };
}

// TODO: This mapping must be updated once the actual Apify actor response shape is known
function mapActorResponse(raw: unknown): MetaAdsResult {
  const items = Array.isArray(raw) ? raw : [];

  const landingPages = new Set<string>();
  const creativeTexts: string[] = [];

  for (const item of items) {
    // TODO: Adjust field paths based on actual actor output schema
    const snapshot = (item as Record<string, unknown>)?.snapshot ?? item;
    if ((snapshot as Record<string, unknown>)?.link_url) landingPages.add((snapshot as Record<string, string>).link_url);
    if ((snapshot as Record<string, unknown>)?.body) {
      const body = (snapshot as Record<string, Record<string, string>>).body;
      if (body?.text) creativeTexts.push(body.text);
    }
    if ((item as Record<string, unknown>)?.ad_creative_link_url) landingPages.add((item as Record<string, string>).ad_creative_link_url);
    if ((item as Record<string, unknown>)?.ad_creative_body) creativeTexts.push((item as Record<string, string>).ad_creative_body);
  }

  // Rough creative angle detection from copy
  const angles = detectCreativeAngles(creativeTexts);

  return {
    active_ads_count: items.length,
    new_ads_7d: null, // TODO: Actor may provide date info to compute this
    new_ads_30d: null,
    landing_pages: Array.from(landingPages).slice(0, 20),
    creative_texts: creativeTexts.slice(0, 20),
    creative_angles: angles,
    sample_ads: items.slice(0, 5),
    raw,
  };
}

function detectCreativeAngles(texts: string[]): string[] {
  const angleKeywords: Record<string, string[]> = {
    'social_proof': ['customers', 'reviews', 'trusted', 'rated', 'stars'],
    'urgency': ['limited', 'sale ends', 'last chance', 'hurry', 'today only'],
    'discount': ['% off', 'save', 'deal', 'discount', 'promo'],
    'problem_solution': ['tired of', 'struggling', 'solution', 'fix', 'stop'],
    'ugc_testimonial': ['i tried', 'my experience', 'honest review', 'changed my'],
    'product_demo': ['see how', 'watch', 'try', 'demo'],
  };

  const detected = new Set<string>();
  const combined = texts.join(' ').toLowerCase();

  for (const [angle, keywords] of Object.entries(angleKeywords)) {
    if (keywords.some((kw) => combined.includes(kw))) {
      detected.add(angle);
    }
  }

  return Array.from(detected);
}

export async function fetchMetaAds(domain: string, facebookUrl?: string): Promise<MetaAdsResult> {
  const actorId = process.env.APIFY_META_ADS_ACTOR_ID;
  if (!actorId) throw new Error('APIFY_META_ADS_ACTOR_ID not set');

  logger.info('Fetching Meta ads via Apify', { domain, facebookUrl, actorId });

  const input = buildActorInput(domain, facebookUrl);
  const raw = await runApifyActor(actorId, input);
  return mapActorResponse(raw);
}
