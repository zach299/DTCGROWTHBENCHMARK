import { logger } from '@/lib/utils/logger';

export interface MetaAdsSignals {
  advertiser_name: string | null;
  active_ads_count: number;
  unique_landing_pages: string[];
  sample_ad_copy: string[]; // up to 5
  sample_creatives: string[]; // image/video URLs if available, up to 5
  first_seen_date: string | null;
  platforms: string[]; // e.g. ["facebook","instagram"]
  raw: unknown; // full dataset items for raw_response
}

const DEFAULT_ACTOR_ID = 'curious_coder~facebook-ads-library-scraper';

/**
 * Extract the page identifier from a facebook URL.
 * e.g. "https://www.facebook.com/ridgewallet/?ref=x" -> "ridgewallet"
 */
export function extractFacebookPageName(facebookUrl: string): string {
  const stripped = facebookUrl
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('?')[0]
    .replace(/\/+$/, '');
  const segments = stripped.split('/').filter(Boolean);
  // segments[0] is the host (facebook.com); first path segment is the page
  return segments[1] ?? '';
}

// Tiny helpers for defensive field access over unknown dataset items.
type Item = Record<string, unknown>;
function get(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}
function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function stripQuery(url: string): string {
  return url.split('?')[0];
}

function toIsoDate(v: unknown): string | null {
  if (v == null) return null;
  // Unix timestamps (seconds or ms)
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

// Normalize for fuzzy name matching: "The Ridge" -> "theridge"
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function runActor(adLibraryUrl: string, count: number): Promise<Item[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('APIFY_TOKEN environment variable is required');
  }
  const actorId = process.env.APIFY_META_ADS_ACTOR_ID || DEFAULT_ACTOR_ID;

  const input = {
    urls: [{ url: adLibraryUrl }],
    count,
    scrapeAdDetails: false,
    period: '',
  };

  // REVERTED 2026-07-08: the Authorization-header-only form started returning
  // 403 for every run (100% failure since Jul 5). Token goes back in the query
  // string — the form that ran ~15k successful scrapes. Header kept as well.
  const endpoint =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    // This actor requires <= 512MB per input URL.
    `?token=${encodeURIComponent(token)}&timeout=120&memory=512`;

  // Retry transient failures (rate limits, 5xx, network blips) with backoff so a
  // momentary Apify hiccup doesn't fail an entire bulk batch. Auth/quota errors
  // (401/402/403) are permanent — surface them immediately and clearly.
  let res: Response | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(125_000),
      });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      res = null;
    }
    if (res?.ok) break;
    if (res && [401, 402, 403].includes(res.status)) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Apify auth/quota error (${res.status}) — check your Apify token & credits: ${body.slice(0, 200)}`
      );
    }
    if (res) lastErr = `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }

  if (!res || !res.ok) {
    throw new Error(`Apify request failed after retries: ${lastErr}`);
  }

  const items = (await res.json()) as unknown;
  const allItems: Item[] = Array.isArray(items) ? (items as Item[]) : [];

  // The actor reports failures as dataset items like { "error": "..." }.
  // Never count those as ads.
  const errorItems = allItems.filter((i) => typeof i.error === 'string');
  const list = allItems.filter((i) => typeof i.error !== 'string');
  if (list.length === 0 && errorItems.length > 0) {
    const msg = String(errorItems[0].error);
    // "Ads not found" / "no ads" simply means this query has no matching active
    // ads — a legitimate 0 result, NOT a failure. Returning empty lets the brand
    // be recorded with 0 ads and keeps the bulk batch progressing. Anything else
    // (rate limits, bad input, actor crashes) is a real error worth surfacing.
    if (/ads?\s+not\s+found|no\s+ads|not\s+found|no\s+result/i.test(msg)) {
      return [];
    }
    throw new Error(`Apify actor error: ${msg.slice(0, 300)}`);
  }
  return list;
}

/**
 * Fetch Meta Ad Library signals for a brand via Apify.
 *
 * Two-step approach so we only count the brand's own ads (a keyword search
 * also returns unrelated advertisers):
 *   1. Keyword-search the Ad Library for the brand's facebook page name and
 *      find the matching page_id among the results.
 *   2. Re-query scoped to that page_id (view_all_page_id), which returns only
 *      that advertiser's ads. Each item carries a `total` field = the true
 *      number of active ads for the query, so we get the real count even
 *      though we only sample up to `count` items.
 */
export async function fetchMetaAdsSignals(
  facebookUrl: string | null,
  brandDomain?: string
): Promise<MetaAdsSignals> {
  // Prefer the Facebook page slug; fall back to the brand name from the domain
  // when no facebook_url is on record (many master_database rows lack it).
  let pageName = facebookUrl ? extractFacebookPageName(facebookUrl) : '';
  if (!pageName && brandDomain) {
    pageName = brandDomain.replace(/^www\./i, '').split('.')[0];
  }
  if (!pageName) {
    throw new Error('Could not determine a brand name to search the Ad Library');
  }

  // Step 1: keyword search to discover the brand's page_id. We only need to
  // find one matching item, and the brand's own ads rank early — so a small
  // sample is enough and keeps this (sequential) first run fast.
  //
  // Use an UNQUOTED query: a quoted exact-phrase query (q="brand") makes the Ad
  // Library return "Ads not found" for many brands whose ad copy doesn't contain
  // the literal page name, producing false zeros. Unquoted keyword search has
  // far better recall, and the fuzzy page-name match below still scopes results
  // to the correct advertiser.
  const searchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=${encodeURIComponent(pageName)}&search_type=keyword_unordered`;
  logger.info('Apify Meta Ads: keyword search', { pageName });
  const searchItems = await runActor(searchUrl, 25);

  const targetNorms = new Set<string>([norm(pageName)]);
  if (brandDomain) {
    const base = brandDomain.split('.')[0];
    if (base) targetNorms.add(norm(base));
  }

  // Count ads per page_id among items whose page_name fuzzy-matches the brand.
  const pageIdVotes = new Map<string, { votes: number; name: string }>();
  for (const item of searchItems) {
    const itemPageName = asString(item.page_name) ?? asString(item.pageName);
    const itemPageId = asString(item.page_id) ?? asString(item.pageId);
    if (!itemPageName || !itemPageId) continue;
    const n = norm(itemPageName);
    const matches = [...targetNorms].some(
      (t) => t.length >= 3 && (n.includes(t) || t.includes(n))
    );
    if (matches) {
      const cur = pageIdVotes.get(itemPageId) ?? { votes: 0, name: itemPageName };
      cur.votes += 1;
      pageIdVotes.set(itemPageId, cur);
    }
  }

  let scopedItems: Item[];
  let advertiserFallback: string | null = null;

  const emptySignals = (): MetaAdsSignals => ({
    advertiser_name: null,
    active_ads_count: 0,
    unique_landing_pages: [],
    sample_ad_copy: [],
    sample_creatives: [],
    first_seen_date: null,
    platforms: [],
    raw: [],
  });

  const best = [...pageIdVotes.entries()].sort((a, b) => b[1].votes - a[1].votes)[0];
  if (best) {
    const [pageId, { name }] = best;
    advertiserFallback = name;
    // Step 2: page-scoped query — only this advertiser's ads.
    const pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&view_all_page_id=${pageId}&search_type=page`;
    logger.info('Apify Meta Ads: page-scoped query', { pageId, name });
    scopedItems = await runActor(pageUrl, 20);
    // If the page query returns nothing, the brand simply has no active ads —
    // do NOT fall back to the contaminated keyword results (their `total` is the
    // global keyword count, e.g. ~50k for a common word like "nothing").
    if (scopedItems.length === 0) return emptySignals();
  } else {
    // Could not confidently identify the brand's own page (common for generic /
    // common-word brand names searched without a facebook_url). Returning the
    // raw keyword results would report a random advertiser and the global
    // keyword total, so return empty instead.
    logger.warn('Apify Meta Ads: no confident page_id match — returning empty', { pageName });
    return emptySignals();
  }

  // --- Map fields (defensive across plausible field names) ---
  let advertiserName: string | null = null;
  const adCopy: string[] = [];
  const creatives: string[] = [];
  const landingPages = new Set<string>();
  const platforms = new Set<string>();
  let firstSeen: string | null = null;
  let totalAds: number | null = null;

  for (const item of scopedItems) {
    // `total` = total results for the (page-scoped) query, i.e. the real
    // active ad count even though we only fetched a sample.
    const t = item.total;
    if (typeof t === 'number' && Number.isFinite(t) && t > (totalAds ?? 0)) {
      totalAds = t;
    }

    advertiserName =
      advertiserName ??
      asString(item.page_name) ??
      asString(item.pageName) ??
      asString(get(item, ['advertiser', 'name']));

    const copy =
      asString(get(item, ['snapshot', 'body', 'text'])) ??
      asString(item.adText) ??
      asString(item.body) ??
      asString(get(item, ['snapshot', 'cards', 0, 'body']));
    // Skip dynamic-creative placeholders (e.g. "{{product.brand}}").
    const isTemplate = copy ? /\{\{.*?\}\}/.test(copy) && copy.replace(/\{\{.*?\}\}/g, '').trim().length < 15 : false;
    if (copy && !isTemplate && adCopy.length < 5 && !adCopy.includes(copy)) adCopy.push(copy);

    const link =
      asString(get(item, ['snapshot', 'link_url'])) ??
      asString(item.linkUrl) ??
      asString(item.link_url) ??
      asString(get(item, ['snapshot', 'cards', 0, 'link_url']));
    if (link) landingPages.add(stripQuery(link));

    if (creatives.length < 5) {
      const images = get(item, ['snapshot', 'images']);
      if (Array.isArray(images)) {
        for (const img of images) {
          const u = asString(get(img, ['original_image_url']));
          if (u && creatives.length < 5 && !creatives.includes(u)) creatives.push(u);
        }
      }
      const videos = get(item, ['snapshot', 'videos']);
      if (Array.isArray(videos)) {
        for (const vid of videos) {
          const u = asString(get(vid, ['video_preview_image_url']));
          if (u && creatives.length < 5 && !creatives.includes(u)) creatives.push(u);
        }
      }
      const imageUrl = asString(item.imageUrl);
      if (imageUrl && creatives.length < 5 && !creatives.includes(imageUrl)) {
        creatives.push(imageUrl);
      }
    }

    const started = toIsoDate(
      item.startDate ?? item.start_date ?? item.ad_delivery_start_time
    );
    if (started && (!firstSeen || started < firstSeen)) firstSeen = started;

    const rawPlatforms =
      item.publisherPlatform ?? item.publisher_platforms ?? item.platforms;
    const platformList = Array.isArray(rawPlatforms)
      ? rawPlatforms
      : typeof rawPlatforms === 'string'
        ? [rawPlatforms]
        : [];
    for (const p of platformList) {
      const s = asString(p);
      if (s) platforms.add(s.toLowerCase());
    }
  }

  const resolvedCount = totalAds ?? scopedItems.length;
  // Sanity backstop. Real high-volume DTC brands (e.g. RYZE) can run ~8k active
  // ads, but contaminated keyword totals are 14k–50k. Reject only the clearly
  // implausible band so legit high-volume advertisers still count.
  if (resolvedCount > 13000) {
    logger.warn('Apify Meta Ads: implausible count rejected', { pageName, resolvedCount });
    return emptySignals();
  }

  return {
    advertiser_name: advertiserName ?? advertiserFallback,
    active_ads_count: resolvedCount,
    unique_landing_pages: [...landingPages].slice(0, 25),
    sample_ad_copy: adCopy,
    sample_creatives: creatives,
    first_seen_date: firstSeen,
    platforms: [...platforms],
    raw: scopedItems,
  };
}
