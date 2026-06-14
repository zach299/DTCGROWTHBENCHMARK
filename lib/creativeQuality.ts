// Paid Media Quality model — the heart of "is this real growth or just a
// product feed?". Raw active-ad count is a poor signal: a brand running 1,000
// dynamic catalog (DPA) ads is not more interesting than one running 250 unique,
// hand-built campaign creatives. This module inspects the sampled Meta ads and
// derives quality metrics that reward genuine creative/testing motion and
// downweight catalog/product-feed volume.
//
// Note: the scraper samples up to ~20 ads per advertiser, so diversity/DPA
// metrics are estimated from that representative sample and applied to the true
// total ad count.

export interface CreativeQuality {
  sample_size: number;
  unique_creative_count: number; // distinct creative concepts in the sample
  creative_diversity_score: number; // 0-100: unique / sampled
  campaign_angle_count: number; // distinct hooks/angles
  offer_diversity: number; // distinct offer types (%, $ off, free ship, bundle…)
  landing_page_diversity: number; // distinct non-catalog landing destinations
  dpa_share: number; // 0-1: estimated share of catalog/DPA/feed ads
  real_creative_score: number; // 0-100: overall paid-media quality
  quality_adjusted_ads: number; // effective ad count after downweighting DPA
  is_catalog_heavy: boolean;
}

type Item = Record<string, unknown>;

function get(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function normCopy(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
}

// Pull the primary ad copy + link for one ad item (defensive across shapes).
function adFields(item: Item): { copy: string; link: string } {
  const copy =
    str(get(item, ['snapshot', 'body', 'text'])) ||
    str(item.adText) ||
    str(item.body) ||
    str(get(item, ['snapshot', 'cards', 0, 'body']));
  const link =
    str(get(item, ['snapshot', 'link_url'])) ||
    str(item.linkUrl) ||
    str(item.link_url) ||
    str(get(item, ['snapshot', 'cards', 0, 'link_url']));
  return { copy, link };
}

const TEMPLATE_RE = /\{\{.*?\}\}|\{\{|\}\}/;
const GENERIC_RE = /^(shop now|shop|buy now|learn more|order now|sale|new arrivals?)\.?$/i;
const PRODUCT_URL_RE = /\/products?\/|\/product\/|\/p\/|[?&](variant|sku|product_id)=/i;

const OFFER_PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'pct_off', re: /\b\d{1,3}\s?%\s?(off|discount)\b/i },
  { id: 'dollar_off', re: /\$\s?\d+\s?(off|discount)\b/i },
  { id: 'free_ship', re: /free\s+(shipping|delivery)/i },
  { id: 'bogo', re: /\b(bogo|buy\s+one|buy\s+1|2\s+for\s+1)\b/i },
  { id: 'bundle', re: /\b(bundle|kit|set|pack)\b/i },
  { id: 'gift', re: /\b(free\s+gift|gift\s+with|gwp)\b/i },
  { id: 'subscribe', re: /\b(subscribe|subscription|auto-?ship)\b/i },
  { id: 'trial', re: /\b(free\s+trial|money-?back|risk-?free|guarantee)\b/i },
  { id: 'sale', re: /\b(sale|clearance|limited\s+time|today\s+only|ends\s+soon)\b/i },
  { id: 'new', re: /\b(new|just\s+launched|introducing)\b/i },
];

/**
 * Analyze a sample of raw Meta ad items + the true total active-ad count.
 * `channelCount` is the number of active ad channels (Meta/Google/LinkedIn).
 */
export function analyzeCreativeQuality(
  rawItems: unknown,
  totalAds: number,
  landingPages: string[] = [],
  channelCount = 1
): CreativeQuality {
  const items: Item[] = Array.isArray(rawItems) ? (rawItems as Item[]) : [];
  const sample = items.length;

  if (sample === 0) {
    // No creative sample — fall back to neutral estimates from counts alone.
    const lpDiv = distinctLandingDestinations(landingPages);
    const score = Math.round(Math.min(100, (totalAds > 0 ? 25 : 0) + lpDiv * 3 + (channelCount - 1) * 8));
    return {
      sample_size: 0,
      unique_creative_count: 0,
      creative_diversity_score: 0,
      campaign_angle_count: 0,
      offer_diversity: 0,
      landing_page_diversity: lpDiv,
      dpa_share: 0,
      real_creative_score: score,
      quality_adjusted_ads: totalAds,
      is_catalog_heavy: false,
    };
  }

  const copies: string[] = [];
  const links: string[] = [];
  let templateCount = 0;
  let genericCount = 0;
  let productLinkCount = 0;

  for (const it of items) {
    const { copy, link } = adFields(it);
    copies.push(copy);
    links.push(link);
    if (copy && TEMPLATE_RE.test(copy)) templateCount++;
    if (copy && GENERIC_RE.test(copy.trim())) genericCount++;
    if (link && PRODUCT_URL_RE.test(link)) productLinkCount++;
  }

  // Frequency of each normalized copy → repeated copy is feed-like.
  const freq = new Map<string, number>();
  for (const c of copies) {
    const n = normCopy(c);
    if (!n) continue;
    freq.set(n, (freq.get(n) ?? 0) + 1);
  }
  const uniqueCopies = [...freq.keys()].filter((k) => k.length > 0);
  const unique_creative_count = uniqueCopies.length;
  const creative_diversity_score = sample > 0 ? Math.round((unique_creative_count / sample) * 100) : 0;

  // Per-ad DPA detection: template var, generic+product-link, or copy that
  // recurs many times (feed duplication).
  let dpaAds = 0;
  for (let i = 0; i < items.length; i++) {
    const c = copies[i];
    const n = normCopy(c);
    const repeats = n ? (freq.get(n) ?? 0) : 0;
    const isTemplate = c ? TEMPLATE_RE.test(c) : false;
    const isGenericProduct = (GENERIC_RE.test((c ?? '').trim()) || !c) && PRODUCT_URL_RE.test(links[i] ?? '');
    const isDuped = repeats >= Math.max(3, Math.ceil(sample * 0.25));
    if (isTemplate || isGenericProduct || isDuped) dpaAds++;
  }
  const dpa_share = Math.min(1, dpaAds / sample);

  // Campaign angles: distinct hooks among non-DPA copies (first ~7 words).
  const angles = new Set<string>();
  for (let i = 0; i < copies.length; i++) {
    const c = copies[i];
    if (!c || TEMPLATE_RE.test(c)) continue;
    const hook = normCopy(c).split(' ').slice(0, 7).join(' ');
    if (hook.length >= 6) angles.add(hook);
  }
  const campaign_angle_count = angles.size;

  // Offer diversity across all sampled copy.
  const allCopy = copies.join(' \n ');
  const offers = new Set<string>();
  for (const o of OFFER_PATTERNS) if (o.re.test(allCopy)) offers.add(o.id);
  const offer_diversity = offers.size;

  const landing_page_diversity = distinctLandingDestinations(landingPages);

  // --- Composite Real Creative Score (0-100) ---
  let score = 0;
  score += Math.min(34, unique_creative_count * 2.2); // genuine concept volume
  score += Math.min(16, campaign_angle_count * 3); // distinct angles
  score += Math.min(12, offer_diversity * 3); // offer testing
  score += Math.min(12, landing_page_diversity * 1.6); // LP testing
  score += Math.min(10, (channelCount - 1) * 6); // channel expansion
  score += Math.min(8, creative_diversity_score * 0.08); // overall freshness
  score -= dpa_share * 28; // catalog/feed penalty
  const real_creative_score = Math.round(Math.max(0, Math.min(100, score)));

  // Effective ad count for ranking: discount the catalog/feed portion heavily
  // and blend in observed creative diversity.
  const realFraction = Math.max(0.1, (1 - dpa_share) * 0.65 + (creative_diversity_score / 100) * 0.35);
  const quality_adjusted_ads = Math.round(totalAds * realFraction);

  return {
    sample_size: sample,
    unique_creative_count,
    creative_diversity_score,
    campaign_angle_count,
    offer_diversity,
    landing_page_diversity,
    dpa_share: Math.round(dpa_share * 100) / 100,
    real_creative_score,
    quality_adjusted_ads,
    is_catalog_heavy: dpa_share >= 0.5,
  };
}

// Distinct meaningful landing destinations: collapse all single-product (SKU)
// pages into one "catalog" bucket, count distinct non-product paths.
function distinctLandingDestinations(landingPages: string[]): number {
  const buckets = new Set<string>();
  let hasCatalog = false;
  for (const url of landingPages) {
    if (!url) continue;
    if (PRODUCT_URL_RE.test(url)) {
      hasCatalog = true;
      continue;
    }
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      buckets.add((u.hostname + u.pathname).replace(/\/$/, '').toLowerCase());
    } catch {
      buckets.add(url.toLowerCase());
    }
  }
  return buckets.size + (hasCatalog ? 1 : 0);
}

// Short human label for the Real Creative Score.
export function creativeQualityLabel(score: number): string {
  if (score >= 75) return 'Exceptional';
  if (score >= 55) return 'Strong';
  if (score >= 35) return 'Moderate';
  if (score >= 15) return 'Light';
  return 'Minimal';
}
