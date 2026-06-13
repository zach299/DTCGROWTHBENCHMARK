import { createServiceClient } from '@/lib/supabase/server';
import { runScoring } from '@/lib/scoring/scoreRunner';
import { ScoreInput } from '@/lib/scoring/growthScorePrompt';
import { logger } from '@/lib/utils/logger';

export async function runScoreEnrichment(domainId: number): Promise<void> {
  logger.info('Running score enrichment', { domainId });
  const supabase = createServiceClient();

  // Gather all latest data
  const [domainRes, socialsRes, adSnapRes, siteSnapRes, hiringSnapRes] = await Promise.all([
    supabase.from('domains').select('*').eq('id', domainId).single(),
    supabase.from('domain_social_profiles').select('*').eq('domain_id', domainId),
    supabase
      .from('ad_snapshots')
      .select('*')
      .eq('domain_id', domainId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('site_snapshots')
      .select('*')
      .eq('domain_id', domainId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('hiring_snapshots')
      .select('*')
      .eq('domain_id', domainId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const domain = domainRes.data;
  if (!domain) throw new Error(`Domain ${domainId} not found`);

  const input: ScoreInput = {
    domain: domain.domain,
    company_name: domain.company_name,
    country: domain.country,
    category: domain.category,
    ecommerce_platform: domain.ecommerce_platform,
    estimated_revenue: domain.estimated_revenue,
    estimated_sales: domain.estimated_sales,
    estimated_traffic: domain.estimated_traffic,
    social_profiles: (socialsRes.data ?? []).map((p: Record<string, unknown>) => ({
      platform: p.platform as string,
      followers: p.followers as number,
      followers_30d: p.followers_30d as number,
      posts: p.posts as number,
      url: p.url as string,
    })),
    ad_snapshot: adSnapRes.data
      ? {
          active_ads_count: adSnapRes.data.active_ads_count,
          new_ads_7d: adSnapRes.data.new_ads_7d,
          new_ads_30d: adSnapRes.data.new_ads_30d,
          landing_pages: adSnapRes.data.landing_pages,
          creative_angles: adSnapRes.data.creative_angles,
          sample_ads: adSnapRes.data.sample_ads,
        }
      : null,
    site_snapshot: siteSnapRes.data
      ? {
          homepage_title: siteSnapRes.data.homepage_title,
          homepage_description: siteSnapRes.data.homepage_description,
          detected_tech: siteSnapRes.data.detected_tech,
          promo_text: siteSnapRes.data.promo_text,
        }
      : null,
    hiring_snapshot: hiringSnapRes.data
      ? {
          jobs_count: hiringSnapRes.data.jobs_count,
          growth_jobs_count: hiringSnapRes.data.growth_jobs_count,
          roles: hiringSnapRes.data.roles,
          careers_url: hiringSnapRes.data.careers_url,
        }
      : null,
  };

  await runScoring(domainId, input);
  logger.info('Score enrichment complete', { domainId });
}
