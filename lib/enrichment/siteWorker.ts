import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

const TECH_SIGNALS: Record<string, string[]> = {
  shopify: ['cdn.shopify.com', 'Shopify.theme', 'myshopify.com'],
  shopify_plus: ['enterprise.shopify.com'],
  klaviyo: ['static.klaviyo.com', 'klaviyo.com/media'],
  attentive: ['cdn.attn.tv', 'attentivemobile.com'],
  postscript: ['postscript.io'],
  recharge: ['rechargepayments.com', 'rechargeapps.com'],
  gorgias: ['config.gorgias.chat'],
  yotpo: ['staticw2.yotpo.com', 'yotpo.com/widget'],
  northbeam: ['northbeam.io'],
  triple_whale: ['triplewhale.com'],
};

function detectTech(html: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [tech, signals] of Object.entries(TECH_SIGNALS)) {
    result[tech] = signals.some((s) => html.includes(s));
  }
  return result;
}

function extractMetaTag(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractPromoText(html: string): string {
  // Strip HTML tags, collapse whitespace, return first 500 chars
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.slice(0, 500);
}

export async function runSiteEnrichment(domainId: number, domain: string): Promise<void> {
  const url = `https://${domain}`;
  logger.info('Running site enrichment', { domain, domainId });

  let html = '';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrowthSignalsBot/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    html = await res.text();
  } catch (err) {
    logger.warn('Failed to fetch site', { domain, err: String(err) });
    // Still store a record with empty data
  }

  const htmlHash = createHash('md5').update(html).digest('hex');
  const detectedTech = detectTech(html);
  const title = extractTitle(html);
  const description = extractMetaTag(html, 'description');
  const promoText = html ? extractPromoText(html) : null;

  const supabase = createServiceClient();
  await supabase.from('site_snapshots').insert({
    domain_id: domainId,
    homepage_title: title,
    homepage_description: description,
    detected_tech: detectedTech,
    promo_text: promoText,
    raw_html_hash: htmlHash,
    raw: { url, tech_detected: detectedTech },
    checked_at: new Date().toISOString(),
  });

  logger.info('Site enrichment complete', { domain, domainId, title });
}
