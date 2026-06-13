import { logger } from '@/lib/utils/logger';

export type AdPlatformName = 'Meta' | 'Google' | 'LinkedIn';
export type AdStatus = 'active' | 'none' | 'unknown';

export interface AdPlatformResult {
  platform: AdPlatformName;
  status: AdStatus; // active = ads found, none = ran but no ads, unknown = not checked / errored
  ads_count: number | null;
  sample_ad_copy: string[];
  sample_creatives: string[];
  library_url: string | null;
  note?: string; // debug: why unknown (env unset / error), or actor item count
  raw?: unknown; // first few items, for tuning field mapping
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function firstNumber(...vals: unknown[]): number | null {
  for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function get(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

async function runActorJson(
  actorId: string,
  input: unknown,
  timeoutMs = 120_000
): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');
  // Apify's URL path uses the tilde form (owner~actor-name). Accept the slash
  // form shown on the store page and normalize it.
  const actorPath = actorId.trim().replace(/^https?:\/\/.*\/acts\//, '').replace(/\//g, '~');
  const endpoint =
    `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&timeout=${Math.floor(timeoutMs / 1000)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs + 10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Never echo actorId — it may hold a misconfigured secret. Redact.
    throw new Error(`Apify actor request failed (${res.status}): ${body.slice(0, 160)}`);
  }
  const items = (await res.json()) as unknown;
  const list = Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
  return list.filter((i) => typeof i.error !== 'string');
}

// Defensive extraction shared across ad-library actors (field names vary by
// actor, so we try the common candidates and surface raw for tuning).
function mapAds(platform: AdPlatformName, list: Record<string, unknown>[], libraryUrl: string): AdPlatformResult {
  const copy: string[] = [];
  const creatives: string[] = [];
  let count: number | null = null;

  for (const it of list) {
    const t = firstNumber(it.total, it.totalCount, it.adsCount, it.resultsCount);
    if (t != null && (count == null || t > count)) count = t;

    const c =
      asString(it.adText) ??
      asString(it.text) ??
      asString(it.body) ??
      asString(it.headline) ??
      asString(it.title) ??
      asString(it.description) ??
      asString(get(it, ['snapshot', 'body', 'text']));
    if (c && copy.length < 5 && !copy.includes(c)) copy.push(c);

    const img =
      asString(it.imageUrl) ??
      asString(it.creativeUrl) ??
      asString(it.thumbnail) ??
      asString(it.image) ??
      asString(get(it, ['creative', 'url']));
    if (img && creatives.length < 5 && !creatives.includes(img)) creatives.push(img);
  }

  if (count == null) count = list.length;
  return {
    platform,
    status: count > 0 ? 'active' : 'none',
    ads_count: count,
    sample_ad_copy: copy,
    sample_creatives: creatives,
    library_url: libraryUrl,
    raw: list.slice(0, 5),
  };
}

function unknownResult(
  platform: AdPlatformName,
  libraryUrl: string,
  note: string
): AdPlatformResult {
  return {
    platform,
    status: 'unknown',
    ads_count: null,
    sample_ad_copy: [],
    sample_creatives: [],
    library_url: libraryUrl,
    note,
  };
}

/**
 * Google Ads Transparency Center lookup via Apify.
 * Set APIFY_GOOGLE_ADS_ACTOR_ID to a Google Ads Transparency scraper actor.
 */
export async function fetchGoogleAds(domain: string): Promise<AdPlatformResult> {
  const libraryUrl = `https://adstransparency.google.com/?region=US&domain=${encodeURIComponent(domain)}`;
  const actorId = process.env.APIFY_GOOGLE_ADS_ACTOR_ID;
  if (!actorId) return unknownResult('Google', libraryUrl, 'APIFY_GOOGLE_ADS_ACTOR_ID not set');
  try {
    // Pass several common input keys so most actors accept at least one.
    // region "" = all regions (SolidCode actor enum: "", "US", "CA", ...).
    const list = await runActorJson(actorId, {
      domain,
      domains: [domain],
      url: libraryUrl,
      startUrls: [{ url: libraryUrl }],
      region: '',
      maxItems: 20,
      maxResults: 20,
      maxNumberOfAds: 20,
    });
    logger.info('Google ads fetched', { domain, items: list.length });
    const result = mapAds('Google', list, libraryUrl);
    result.note = `items=${list.length}`;
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Google ads fetch failed', { error: msg });
    return unknownResult('Google', libraryUrl, `error: ${msg}`);
  }
}

/**
 * LinkedIn Ad Library lookup via Apify.
 * Set APIFY_LINKEDIN_ADS_ACTOR_ID to a LinkedIn Ad Library scraper actor.
 */
export async function fetchLinkedInAds(
  domain: string,
  companyName?: string
): Promise<AdPlatformResult> {
  const query = companyName || domain.split('.')[0];
  const libraryUrl = `https://www.linkedin.com/ad-library/search?keyword=${encodeURIComponent(query)}`;
  const actorId = process.env.APIFY_LINKEDIN_ADS_ACTOR_ID;
  if (!actorId) return unknownResult('LinkedIn', libraryUrl, 'APIFY_LINKEDIN_ADS_ACTOR_ID not set');
  try {
    const list = await runActorJson(actorId, {
      startUrls: [{ url: libraryUrl }],
      keyword: query,
      companyName: query,
      query,
      url: libraryUrl,
      maxItems: 20,
      maxResults: 20,
    });
    logger.info('LinkedIn ads fetched', { query, items: list.length });
    const result = mapAds('LinkedIn', list, libraryUrl);
    result.note = `items=${list.length}`;
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('LinkedIn ads fetch failed', { error: msg });
    return unknownResult('LinkedIn', libraryUrl, `error: ${msg}`);
  }
}
