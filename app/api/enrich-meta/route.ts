import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchMetaAdsSignals } from '@/lib/providers/apifyMetaAds';
import { inferCampaignThemes } from '@/lib/providers/crawlHomepage';
import { normalizeDomain } from '@/lib/utils/domain';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// Meta-only enrichment for the bulk dataset. No website crawl, no Google /
// LinkedIn, no AI. Returns the computed Meta signals; the bulk script persists
// them to company_meta_signals.
export const maxDuration = 300;

const bodySchema = z.object({
  domain: z.string().min(1),
  facebook_url: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
});

function velocityLabel(count: number): string {
  if (count >= 100) return 'High';
  if (count >= 25) return 'Medium';
  if (count >= 1) return 'Low';
  return 'None';
}
function diversityLabel(n: number): string {
  if (n >= 5) return 'High';
  if (n >= 3) return 'Medium';
  if (n >= 1) return 'Low';
  return 'None';
}
function activityLevel(c: number): string {
  if (c >= 50) return 'high';
  if (c >= 10) return 'medium';
  if (c >= 1) return 'low';
  return 'none';
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'domain required' }, { status: 400 });
  }
  if (!process.env.APIFY_TOKEN) {
    return NextResponse.json({ ok: false, error: 'APIFY_TOKEN not set' }, { status: 500 });
  }

  const domain = normalizeDomain(parsed.data.domain);
  try {
    const meta = await fetchMetaAdsSignals(parsed.data.facebook_url ?? null, domain);
    const count = meta.active_ads_count;
    const themes = inferCampaignThemes(meta.unique_landing_pages);

    const signals = {
      domain,
      company_name: parsed.data.company_name ?? null,
      active_meta_ads: count,
      creative_count: count, // each active ad is a distinct creative
      creative_velocity: velocityLabel(count),
      campaign_diversity: diversityLabel(meta.unique_landing_pages.length),
      ad_activity_level: activityLevel(count),
      landing_pages: meta.unique_landing_pages,
      campaign_themes: themes,
      sample_ad_copy: meta.sample_ad_copy,
      first_seen_date: meta.first_seen_date,
      last_seen_date: null,
      raw_meta_response: meta.raw,
    };

    // Persist so a UI/browser-driven run doesn't need direct DB access.
    try {
      const supabase = createServiceClient();
      await supabase
        .from('company_meta_signals')
        .upsert({ ...signals, last_enriched_at: new Date().toISOString() }, { onConflict: 'domain' });
    } catch (e) {
      logger.error('enrich-meta persist failed', {
        domain,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return NextResponse.json({ ok: true, signals });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('enrich-meta failed', { domain, error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
