import { logger } from '@/lib/utils/logger';

export interface BrandContext {
  seo_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  h1: string | null;
  hero_headline: string | null;
  hero_subheadline: string | null;
}

export interface WebsiteSignals {
  subscription: boolean;
  affiliate_program: boolean;
  retail_presence: boolean;
  international: boolean;
  careers_active: boolean;
  careers_roles: string[];
}

export interface DetectedTech {
  name: string;
  category: string;
}

export interface HomepageCrawlResult {
  brand_context: BrandContext;
  website_signals: WebsiteSignals;
  tech_stack: DetectedTech[];
  crawl_source: string; // debug: 'apify-html' | 'apify-synth' | 'jina'
  crawl_html_len: number; // debug: length of HTML we parsed
}

// Fingerprints matched against the raw page HTML (script srcs, pixel snippets,
// CDN domains, global vars). Ordered roughly by GTM relevance.
const TECH_FINGERPRINTS: { name: string; category: string; pattern: RegExp }[] = [
  // Attribution / analytics — highest GTM relevance for Northbeam
  { name: 'Northbeam', category: 'Attribution', pattern: /northbeam/i },
  { name: 'Triple Whale', category: 'Attribution', pattern: /triplewhale|triple-whale|tw-pixel/i },
  { name: 'Elevar', category: 'Attribution', pattern: /elevar|getelevar/i },
  { name: 'Rockerbox', category: 'Attribution', pattern: /rockerbox/i },
  { name: 'Google Analytics', category: 'Analytics', pattern: /google-analytics\.com|gtag\(|googletagmanager\.com\/gtag/i },
  { name: 'Google Tag Manager', category: 'Analytics', pattern: /googletagmanager\.com\/gtm/i },
  // Ad pixels — paid channel signals
  { name: 'Meta Pixel', category: 'Ad Pixel', pattern: /connect\.facebook\.net|fbevents\.js|fbq\(/i },
  { name: 'TikTok Pixel', category: 'Ad Pixel', pattern: /analytics\.tiktok\.com|ttq\.load|ttq\.track/i },
  { name: 'Google Ads', category: 'Ad Pixel', pattern: /googleadservices\.com|google_conversion|aw-\d/i },
  { name: 'Pinterest Tag', category: 'Ad Pixel', pattern: /pintrk\(|s\.pinimg\.com/i },
  { name: 'Snapchat Pixel', category: 'Ad Pixel', pattern: /snaptr\(|sc-static\.net/i },
  // Platform
  { name: 'Shopify', category: 'Platform', pattern: /cdn\.shopify\.com|shopify\.com|myshopify\.com|Shopify\./i },
  { name: 'WooCommerce', category: 'Platform', pattern: /woocommerce/i },
  { name: 'BigCommerce', category: 'Platform', pattern: /bigcommerce/i },
  // Email / SMS — lifecycle stack
  { name: 'Klaviyo', category: 'Email/SMS', pattern: /klaviyo/i },
  { name: 'Attentive', category: 'Email/SMS', pattern: /attentive|attentivemobile/i },
  { name: 'Postscript', category: 'Email/SMS', pattern: /postscript|postscript\.io/i },
  { name: 'Omnisend', category: 'Email/SMS', pattern: /omnisend/i },
  { name: 'Mailchimp', category: 'Email/SMS', pattern: /mailchimp|mc\.us\d+\.list-manage/i },
  // Reviews / UGC
  { name: 'Yotpo', category: 'Reviews', pattern: /yotpo/i },
  { name: 'Okendo', category: 'Reviews', pattern: /okendo/i },
  { name: 'Stamped', category: 'Reviews', pattern: /stamped\.io/i },
  { name: 'Judge.me', category: 'Reviews', pattern: /judge\.me|judgeme/i },
  { name: 'Loox', category: 'Reviews', pattern: /loox\.io|loox/i },
  // Subscriptions
  { name: 'Recharge', category: 'Subscriptions', pattern: /rechargecdn|rechargepayments|recharge\.com/i },
  { name: 'Skio', category: 'Subscriptions', pattern: /skio\.com|skio/i },
  { name: 'Loop Subscriptions', category: 'Subscriptions', pattern: /loopwork|loop-subscriptions/i },
  // Personalization / CRO
  { name: 'Rebuy', category: 'Personalization', pattern: /rebuyengine|rebuy/i },
  { name: 'Nosto', category: 'Personalization', pattern: /nosto/i },
  // Helpdesk
  { name: 'Gorgias', category: 'Helpdesk', pattern: /gorgias/i },
  { name: 'Zendesk', category: 'Helpdesk', pattern: /zendesk|zdassets/i },
  { name: 'Intercom', category: 'Helpdesk', pattern: /intercom\.io|intercomcdn/i },
  // Returns
  { name: 'Loop Returns', category: 'Returns', pattern: /loopreturns/i },
  { name: 'Returnly', category: 'Returns', pattern: /returnly/i },
];

function detectTechStack(html: string): DetectedTech[] {
  const found: DetectedTech[] = [];
  const seen = new Set<string>();
  for (const fp of TECH_FINGERPRINTS) {
    if (fp.pattern.test(html) && !seen.has(fp.name)) {
      seen.add(fp.name);
      found.push({ name: fp.name, category: fp.category });
    }
  }
  return found;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractMetaContent(html: string, nameOrProp: string, attrName: string): string | null {
  // Matches both attribute orderings: name/property before content, and content before name/property
  const patterns = [
    new RegExp(
      `<meta[^>]+${attrName}=["']${nameOrProp}["'][^>]+content=["']([^"']{1,500})["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']{1,500})["'][^>]+${attrName}=["']${nameOrProp}["']`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  return m ? decodeEntities(stripTags(m[1])) : null;
}

function extractH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i);
  return m ? decodeEntities(stripTags(m[1])) : null;
}

// Find the first <p> or <h2> that appears reasonably close after the first <h1>
function extractHeroSubheadline(html: string): string | null {
  const h1End = html.search(/<\/h1>/i);
  if (h1End === -1) return null;
  const afterH1 = html.slice(h1End, h1End + 2000);
  // Try <h2> first
  const h2 = afterH1.match(/<h2[^>]*>([\s\S]{1,300}?)<\/h2>/i);
  if (h2) {
    const text = decodeEntities(stripTags(h2[1]));
    if (text.length > 5) return text;
  }
  // Fall back to <p>
  const p = afterH1.match(/<p[^>]*>([\s\S]{10,300}?)<\/p>/i);
  if (p) {
    const text = decodeEntities(stripTags(p[1]));
    if (text.length > 10) return text;
  }
  return null;
}

function detectWebsiteSignals(html: string): WebsiteSignals {
  const low = html.toLowerCase();

  const subscription =
    /subscribe.{0,30}save|save.{0,30}subscri|membership|recurring.{0,20}delivery|subscribe.{0,20}ship|auto.?replenish/.test(
      low
    );

  const affiliate_program =
    /affiliate\s*program|become.{0,20}affiliate|ambassador\s*program|creator\s*program|partner\s*program|referral\s*program/.test(
      low
    );

  const retail_presence =
    /store.{0,10}locator|find.{0,20}store|retail.{0,10}partner|wholesale|sold.{0,20}in.{0,20}store|find.{0,10}us.{0,10}in/.test(
      low
    );

  const international =
    /hreflang|currency.{0,20}selector|country.{0,20}selector|select.{0,20}country|select.{0,20}region|multiple.{0,20}currenc|international.{0,20}shipping/.test(
      low
    ) || /<html[^>]+lang=["'][a-z]{2}-[a-z]{2}["']/i.test(html);

  const CAREER_KEYWORDS = [
    'growth',
    'performance marketing',
    'paid social',
    'lifecycle',
    'media buyer',
    'acquisition',
    'retention',
    'email marketing',
    'ecommerce manager',
    'brand manager',
  ];

  const careersPageExists = /href=["'][^"']*\/(careers|jobs)[/"'?]/.test(low);
  const careersRoles = careersPageExists
    ? CAREER_KEYWORDS.filter((kw) => low.includes(kw))
    : [];

  return {
    subscription,
    affiliate_program,
    retail_presence,
    international,
    careers_active: careersPageExists,
    careers_roles: careersRoles,
  };
}

const READER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// cheerio-scraper returns the raw HTTP response HTML (scripts/meta intact),
// which is what tech-stack fingerprinting needs. website-content-crawler
// strips scripts during readability extraction, so it can't be used here.
const DEFAULT_WEBSITE_ACTOR_ID = 'apify~cheerio-scraper';

/**
 * Fetch homepage HTML via Apify's website-content-crawler.
 *
 * Apify fetches through its own proxy IPs, so it gets past the Shopify/
 * Cloudflare 403s that block Vercel's datacenter IPs. We request the raw HTML
 * (saveHtml) so our existing parsers work unchanged. If the dataset item has
 * no html (some pages), we synthesise a minimal document from the metadata and
 * text the actor extracted so the parsers still find title/description/signals.
 */
interface FetchedHtml {
  html: string;
  source: string; // debug: which path produced the HTML
}

async function fetchViaApify(url: string): Promise<FetchedHtml> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');
  const actorId = process.env.APIFY_WEBSITE_ACTOR_ID || DEFAULT_WEBSITE_ACTOR_ID;

  // pageFunction runs inside the actor; it returns the full raw HTML of the
  // page (cheerio keeps <script>/<meta> tags from the original response).
  const pageFunction =
    'async function pageFunction(context) { const { $, request } = context; return { url: request.url, html: $.html() }; }';

  const input = {
    startUrls: [{ url }],
    pageFunction,
    proxyConfiguration: { useApifyProxy: true },
    maxRequestsPerCrawl: 1,
    maxRequestRetries: 1,
    // Don't follow links — we only want the homepage.
    linkSelector: '',
    globs: [],
    pseudoUrls: [],
  };

  const endpoint =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&timeout=90`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(100_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify website crawl failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const items = (await res.json()) as unknown;
  const list = Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
  const item = list.find((i) => typeof i.error !== 'string');
  const html = item && typeof item.html === 'string' ? item.html : '';
  if (!html) {
    throw new Error(
      `Apify cheerio-scraper returned no html (keys: ${item ? Object.keys(item).join(',') : 'none'})`
    );
  }
  return { html, source: 'apify-html' };
}

/** Fetch homepage HTML via the Jina reader proxy (r.jina.ai). */
async function fetchViaJina(url: string): Promise<FetchedHtml> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      'X-Return-Format': 'html',
      Accept: 'text/html,*/*;q=0.8',
      'User-Agent': READER_UA,
    },
    signal: AbortSignal.timeout(25_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Jina reader fetch failed: ${res.status}`);
  return { html: await res.text(), source: 'jina' };
}

/**
 * Fetch homepage HTML. Apify (proxy-backed) is the primary source; Jina is the
 * fallback. We never fetch sites directly from Vercel — datacenter IPs get
 * 403'd by Shopify/Cloudflare bot protection. If both fail, the caller skips
 * website enrichment and continues scoring on Meta Ads signals.
 */
async function fetchHomepageHtml(url: string): Promise<FetchedHtml> {
  try {
    return await fetchViaApify(url);
  } catch (err) {
    logger.warn('Apify website crawl failed — falling back to Jina', {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return await fetchViaJina(url);
  }
}

export async function crawlHomepage(domain: string): Promise<HomepageCrawlResult> {
  const url = `https://${domain}`;
  logger.info('Crawling homepage', { url });

  // Cap parse size to bound regex cost, but keep it large — tech-stack pixels
  // and signal keywords can appear late in the <body>.
  const fetched = await fetchHomepageHtml(url);
  const html = fetched.html.slice(0, 600_000);

  const seo_title = extractTitle(html);
  const meta_description = extractMetaContent(html, 'description', 'name');
  const og_title = extractMetaContent(html, 'og:title', 'property');
  const og_description = extractMetaContent(html, 'og:description', 'property');
  const h1 = extractH1(html);
  const hero_headline = h1;
  const hero_subheadline = extractHeroSubheadline(html);
  const website_signals = detectWebsiteSignals(html);
  // Tech stack needs the raw page code (script srcs, pixel snippets) — this is
  // why we crawl via Apify rather than a markdown reader.
  const tech_stack = detectTechStack(html);

  return {
    brand_context: {
      seo_title,
      meta_description,
      og_title,
      og_description,
      h1,
      hero_headline,
      hero_subheadline,
    },
    website_signals,
    tech_stack,
    crawl_source: fetched.source,
    crawl_html_len: html.length,
  };
}

export function inferCampaignThemes(landingPages: string[]): string[] {
  const themes = new Set<string>();
  for (const url of landingPages) {
    const slug = (url.split('/').pop() ?? url).toLowerCase();
    if (/father|dad|fday/.test(slug)) themes.add("Father's Day Campaign");
    if (/mother|mom|mday/.test(slug)) themes.add("Mother's Day Campaign");
    if (/bundle/.test(slug)) themes.add('Bundle Offers');
    if (/quiz/.test(slug)) themes.add('Product Quiz');
    if (/influencer|collab|mkbhd|creator/.test(slug)) themes.add('Influencer / Creator Campaign');
    if (/sale|discount|off|promo/.test(slug)) themes.add('Promotional Sale');
    if (/launch|new-/.test(slug)) themes.add('Product Launch');
    if (/gift|gifting/.test(slug)) themes.add('Gift Campaign');
    if (/holiday|xmas|christmas|thanksgiving/.test(slug)) themes.add('Holiday Campaign');
    if (/edc|everyday.carry/.test(slug)) themes.add('EDC / Everyday Carry');
    if (/tech|partner|collab/.test(slug)) themes.add('Brand Partnership');
    if (/ring/.test(slug)) themes.add('Rings / Accessories');
    if (/wallet|card/.test(slug)) themes.add('Wallet / Card Holder');
    if (/summer|spring|fall|winter/.test(slug)) themes.add('Seasonal Campaign');
  }
  return [...themes].slice(0, 8);
}
