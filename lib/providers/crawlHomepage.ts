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

export interface HomepageCrawlResult {
  brand_context: BrandContext;
  website_signals: WebsiteSignals;
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

/**
 * Fetch homepage HTML via the Jina reader proxy (r.jina.ai).
 *
 * We do NOT fetch sites directly from Vercel — datacenter IPs get 403'd by
 * Shopify/Cloudflare bot protection. Jina fetches from its own infrastructure
 * and returns the raw HTML, which our parsers read. If Jina fails, the caller
 * skips website enrichment and continues scoring on Meta Ads signals.
 */
async function fetchHomepageHtml(url: string): Promise<string> {
  const proxyUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(proxyUrl, {
    headers: {
      // Ask the reader to return raw HTML so our existing parsers work.
      'X-Return-Format': 'html',
      Accept: 'text/html,*/*;q=0.8',
      'User-Agent': READER_UA,
    },
    signal: AbortSignal.timeout(25_000),
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Jina reader fetch failed: ${res.status}`);
  }
  return await res.text();
}

export async function crawlHomepage(domain: string): Promise<HomepageCrawlResult> {
  const url = `https://${domain}`;
  logger.info('Crawling homepage', { url });

  // Limit parse to first 200KB — meta/hero content is always in the <head> and early <body>
  const fullHtml = await fetchHomepageHtml(url);
  const html = fullHtml.slice(0, 200_000);

  const seo_title = extractTitle(html);
  const meta_description = extractMetaContent(html, 'description', 'name');
  const og_title = extractMetaContent(html, 'og:title', 'property');
  const og_description = extractMetaContent(html, 'og:description', 'property');
  const h1 = extractH1(html);
  const hero_headline = h1;
  const hero_subheadline = extractHeroSubheadline(html);
  const website_signals = detectWebsiteSignals(html);

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
