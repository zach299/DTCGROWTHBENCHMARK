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
  crawl_source: string; // debug: 'jina' | 'apify-html'
  crawl_html_len: number; // debug: length of HTML we parsed
  crawl_note: string | null; // debug: failed-primary error, if any
}

// Category display/priority order. detectTechStack returns matches grouped in
// this order so the most GTM-relevant stacks surface first.
export const TECH_CATEGORY_ORDER = [
  'Ad Platform',
  'Backend',
  'Measurement',
  'Lifecycle',
] as const;

// Fingerprints matched against the raw page HTML (script srcs, pixel snippets,
// CDN domains, global vars).
const TECH_FINGERPRINTS: { name: string; category: string; pattern: RegExp }[] = [
  // --- 1. Ad Platforms (which paid channels they actually run) ---
  { name: 'Meta', category: 'Ad Platform', pattern: /connect\.facebook\.net|fbevents\.js|fbq\(/i },
  { name: 'Google Ads', category: 'Ad Platform', pattern: /googleadservices\.com|googlesyndication\.com|google_conversion|gtag\/js\?id=AW-|\bAW-\d{8,}/i },
  { name: 'TikTok', category: 'Ad Platform', pattern: /analytics\.tiktok\.com|ttq\.load|ttq\.track/i },
  { name: 'Pinterest', category: 'Ad Platform', pattern: /pintrk\(|s\.pinimg\.com|ct\.pinterest\.com/i },
  { name: 'Snapchat', category: 'Ad Platform', pattern: /snaptr\(|sc-static\.net|tr\.snapchat\.com/i },
  { name: 'Reddit', category: 'Ad Platform', pattern: /redditstatic\.com\/ads|rdt\(|pixel\.reddit/i },
  { name: 'X (Twitter)', category: 'Ad Platform', pattern: /static\.ads-twitter\.com|twq\(|analytics\.twitter\.com/i },
  { name: 'The Trade Desk', category: 'Ad Platform', pattern: /adsrvr\.org|thetradedesk/i },
  { name: 'StackAdapt', category: 'Ad Platform', pattern: /stackadapt/i },
  { name: 'MNTN', category: 'Ad Platform', pattern: /mntn\.com|getmntn|mntn\.ai/i },
  { name: 'Vibe', category: 'Ad Platform', pattern: /vibe\.co|getvibe/i },
  { name: 'AdRoll', category: 'Ad Platform', pattern: /adroll\.com|adroll/i },

  // --- 2. Backend (commerce platform + CRM) ---
  { name: 'Shopify', category: 'Backend', pattern: /cdn\.shopify\.com|myshopify\.com|Shopify\.theme|shopify/i },
  { name: 'WooCommerce', category: 'Backend', pattern: /woocommerce/i },
  { name: 'BigCommerce', category: 'Backend', pattern: /bigcommerce/i },
  { name: 'Magento', category: 'Backend', pattern: /magento|mage\/|static\/version.*\/frontend/i },
  { name: 'Salesforce Commerce', category: 'Backend', pattern: /demandware|salesforce commerce|\bsfcc\b/i },
  { name: 'Wix', category: 'Backend', pattern: /wixstatic|parastorage/i },
  { name: 'Squarespace', category: 'Backend', pattern: /squarespace/i },
  { name: 'HubSpot', category: 'Backend', pattern: /js\.hs-scripts\.com|hs-analytics|hsforms|hubspot/i },
  { name: 'Salesforce / Pardot', category: 'Backend', pattern: /pardot|pi\.pardot|sfdcstatic|force\.com/i },

  // --- 3. Measurement Stack (attribution / analytics) ---
  { name: 'Northbeam', category: 'Measurement', pattern: /northbeam/i },
  { name: 'Triple Whale', category: 'Measurement', pattern: /triplewhale|triple-whale|gettriplewhale/i },
  { name: 'WorkMagic', category: 'Measurement', pattern: /workmagic/i },
  { name: 'Haus', category: 'Measurement', pattern: /haus\.io|gethaus/i },
  { name: 'Rockerbox', category: 'Measurement', pattern: /rockerbox/i },
  { name: 'Elevar', category: 'Measurement', pattern: /elevar|getelevar/i },
  { name: 'Blotout', category: 'Measurement', pattern: /blotout/i },
  { name: 'HYROS', category: 'Measurement', pattern: /hyros/i },
  { name: 'Measured', category: 'Measurement', pattern: /measured\.com/i },
  { name: 'Wicked Reports', category: 'Measurement', pattern: /wickedreports/i },
  { name: 'GA4', category: 'Measurement', pattern: /google-analytics\.com\/g\/collect|gtag\(['"]config['"],\s*['"]G-|\bG-[A-Z0-9]{8,}\b/i },
  { name: 'Google Tag Manager', category: 'Measurement', pattern: /googletagmanager\.com\/gtm|\bGTM-[A-Z0-9]+\b/i },

  // --- 4. Lifecycle Stack (email / SMS / retention — top tools) ---
  { name: 'Klaviyo', category: 'Lifecycle', pattern: /klaviyo/i },
  { name: 'Attentive', category: 'Lifecycle', pattern: /attentive|attentivemobile/i },
  { name: 'Postscript', category: 'Lifecycle', pattern: /postscript\.io|postscript/i },
  { name: 'Omnisend', category: 'Lifecycle', pattern: /omnisend/i },
  { name: 'Mailchimp', category: 'Lifecycle', pattern: /mailchimp|list-manage\.com/i },
  { name: 'Sendlane', category: 'Lifecycle', pattern: /sendlane/i },
  { name: 'Drip', category: 'Lifecycle', pattern: /getdrip|drip\.com/i },
  { name: 'Iterable', category: 'Lifecycle', pattern: /iterable/i },
  { name: 'Braze', category: 'Lifecycle', pattern: /braze\.com|appboy/i },
  { name: 'Listrak', category: 'Lifecycle', pattern: /listrak/i },
  { name: 'Customer.io', category: 'Lifecycle', pattern: /customer\.io/i },
  { name: 'Yotpo SMS', category: 'Lifecycle', pattern: /smsbump|yotpo.{0,20}sms/i },
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
  // Stable sort into the priority category order (fingerprints are already in
  // that order, but this guards against future reordering).
  const order = (c: string) => {
    const i = TECH_CATEGORY_ORDER.indexOf(c as (typeof TECH_CATEGORY_ORDER)[number]);
    return i === -1 ? TECH_CATEGORY_ORDER.length : i;
  };
  return found.sort((a, b) => order(a.category) - order(b.category));
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
  note?: string; // debug: error from a failed primary source, if any
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
  const headers: Record<string, string> = {
    'X-Return-Format': 'html',
    Accept: 'text/html,*/*;q=0.8',
    'User-Agent': READER_UA,
  };
  // Optional: a JINA_API_KEY lifts the free-tier rate limit.
  if (process.env.JINA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  }
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers,
    signal: AbortSignal.timeout(25_000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Jina reader fetch failed: ${res.status}`);
  return { html: await res.text(), source: 'jina' };
}

/**
 * Fetch homepage HTML. Jina reader is the primary source — it returns the full
 * raw HTML (incl. <script>/<meta>) from non-datacenter IPs, so it gets past
 * Shopify/Cloudflare 403s and supports tech-stack detection. Apify's
 * cheerio-scraper is the fallback if Jina is down or rate-limits. We never
 * fetch sites directly from Vercel (datacenter IPs get 403'd). If both fail,
 * the caller skips website enrichment and continues scoring on Meta Ads.
 *
 * The losing source's error is recorded in `note` for debugging.
 */
async function fetchHomepageHtml(url: string): Promise<FetchedHtml> {
  try {
    return await fetchViaJina(url);
  } catch (jinaErr) {
    const jinaMsg = jinaErr instanceof Error ? jinaErr.message : String(jinaErr);
    logger.warn('Jina reader failed — falling back to Apify', { url, error: jinaMsg });
    const fetched = await fetchViaApify(url);
    return { ...fetched, note: `jina_failed: ${jinaMsg}` };
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
    crawl_note: fetched.note ?? null,
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
