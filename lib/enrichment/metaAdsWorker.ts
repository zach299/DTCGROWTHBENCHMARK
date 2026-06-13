import { createServiceClient } from '@/lib/supabase/server';
import { fetchMetaAds } from '@/lib/providers/apifyMetaAds';
import { logger } from '@/lib/utils/logger';

export async function runMetaAdsEnrichment(domainId: number, domain: string): Promise<void> {
  logger.info('Running Meta ads enrichment', { domain, domainId });

  const supabase = createServiceClient();

  // Get Facebook URL from social profiles
  const { data: fbProfile } = await supabase
    .from('domain_social_profiles')
    .select('url')
    .eq('domain_id', domainId)
    .eq('platform', 'facebook')
    .single();

  const facebookUrl = fbProfile?.url ?? undefined;

  const result = await fetchMetaAds(domain, facebookUrl);

  // Upsert ad_account if we have a facebook URL
  if (facebookUrl) {
    await supabase.from('ad_accounts').upsert(
      {
        domain_id: domainId,
        platform: 'meta',
        account_url: facebookUrl,
        raw: { source: 'apify' },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'platform,account_url' }
    );
  }

  // Insert ad snapshot
  await supabase.from('ad_snapshots').insert({
    domain_id: domainId,
    platform: 'meta',
    active_ads_count: result.active_ads_count,
    new_ads_7d: result.new_ads_7d,
    new_ads_30d: result.new_ads_30d,
    landing_pages: result.landing_pages,
    creative_texts: result.creative_texts,
    creative_angles: result.creative_angles,
    sample_ads: result.sample_ads,
    raw: result.raw,
    checked_at: new Date().toISOString(),
  });

  logger.info('Meta ads enrichment complete', { domain, domainId, activeAds: result.active_ads_count });
}
