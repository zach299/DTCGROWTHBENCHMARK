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

/**
 * Fetch Meta Ad Library signals for a brand via Apify.
 *
 * Uses the run-sync-get-dataset-items endpoint so no polling is needed.
 *
 * TODO: The actor input shape and dataset item field names below are based on
 * the documented schema of `curious_coder~facebook-ads-library-scraper` and
 * may need adjustment after a real run. Field mapping is intentionally
 * defensive (multiple plausible field names with fallbacks).
 */
export async function fetchMetaAdsSignals(facebookUrl: string): Promise<MetaAdsSignals> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('APIFY_TOKEN environment variable is required');
  }
  const actorId = process.env.APIFY_META_ADS_ACTOR_ID || DEFAULT_ACTOR_ID;

  const pageName = extractFacebookPageName(facebookUrl);
  if (!pageName) {
    throw new Error(`Could not extract page name from facebook URL: ${facebookUrl}`);
  }

  // Search the Ad Library by page name (keyword search) — we don't have a
  // numeric page ID, so view_all_page_id is not an option here.
  const adLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q="${pageName}"&search_type=keyword_unordered`;

  const input = {
    urls: [{ url: adLibraryUrl }],
    count: 100,
    scrapeAdDetails: false,
    period: '',
  };

  const endpoint =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    // This actor requires <= 512MB per input URL.
    `?token=${encodeURIComponent(token)}&timeout=120&memory=512`;

  logger.info('Fetching Meta Ads signals via Apify', { actorId, pageName });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(125_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const items = (await res.json()) as unknown;
  const allItems: Item[] = Array.isArray(items) ? (items as Item[]) : [];

  // The actor reports failures as dataset items like { "error": "..." }.
  // Never count those as ads; if that's all we got, treat the run as failed.
  const errorItems = allItems.filter((i) => typeof i.error === 'string');
  const list = allItems.filter((i) => typeof i.error !== 'string');
  if (list.length === 0 && errorItems.length > 0) {
    throw new Error(`Apify actor error: ${String(errorItems[0].error).slice(0, 300)}`);
  }

  // --- Defensive mapping over plausible field names ---
  let advertiserName: string | null = null;
  const adCopy: string[] = [];
  const creatives: string[] = [];
  const landingPages = new Set<string>();
  const platforms = new Set<string>();
  let firstSeen: string | null = null;

  for (const item of list) {
    advertiserName =
      advertiserName ??
      asString(item.pageName) ??
      asString(item.page_name) ??
      asString(get(item, ['advertiser', 'name']));

    const copy =
      asString(get(item, ['snapshot', 'body', 'text'])) ??
      asString(item.adText) ??
      asString(item.body) ??
      asString(get(item, ['snapshot', 'cards', 0, 'body']));
    if (copy && adCopy.length < 5 && !adCopy.includes(copy)) adCopy.push(copy);

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

  return {
    advertiser_name: advertiserName,
    active_ads_count: list.length,
    unique_landing_pages: [...landingPages].slice(0, 25),
    sample_ad_copy: adCopy,
    sample_creatives: creatives,
    first_seen_date: firstSeen,
    platforms: [...platforms],
    raw: items,
  };
}
