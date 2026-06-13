import { createServiceClient } from '@/lib/supabase/server';
import { runSiteEnrichment } from './siteWorker';
import { runHiringEnrichment } from './hiringWorker';
import { runMetaAdsEnrichment } from './metaAdsWorker';
import { runScoreEnrichment } from './scoreWorker';
import { logger } from '@/lib/utils/logger';

const MAX_ATTEMPTS = 3;

export async function processEnrichmentJobs(limit = 10): Promise<void> {
  const supabase = createServiceClient();

  const { data: jobs, error } = await supabase
    .from('enrichment_jobs')
    .select('id, domain_id, job_type, attempts')
    .in('status', ['queued', 'failed'])
    .lt('attempts', MAX_ATTEMPTS)
    .order('priority', { ascending: false })
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.error('Failed to fetch enrichment jobs', { error: error.message });
    return;
  }

  if (!jobs || jobs.length === 0) {
    logger.info('No enrichment jobs to process');
    return;
  }

  logger.info(`Processing ${jobs.length} enrichment jobs`);

  for (const job of jobs) {
    // Mark as running
    await supabase
      .from('enrichment_jobs')
      .update({ status: 'running', started_at: new Date().toISOString(), attempts: job.attempts + 1 })
      .eq('id', job.id);

    try {
      // Get domain
      const { data: domain } = await supabase
        .from('domains')
        .select('domain')
        .eq('id', job.domain_id)
        .single();

      if (!domain) throw new Error(`Domain ${job.domain_id} not found`);

      switch (job.job_type) {
        case 'site':
          await runSiteEnrichment(job.domain_id, domain.domain);
          break;
        case 'hiring':
          await runHiringEnrichment(job.domain_id, domain.domain);
          break;
        case 'meta_ads':
          await runMetaAdsEnrichment(job.domain_id, domain.domain);
          break;
        case 'score':
          await runScoreEnrichment(job.domain_id);
          break;
        default:
          throw new Error(`Unknown job type: ${job.job_type}`);
      }

      await supabase
        .from('enrichment_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', job.id);
    } catch (err) {
      logger.error('Enrichment job failed', { jobId: job.id, jobType: job.job_type, err: String(err) });
      await supabase
        .from('enrichment_jobs')
        .update({ status: 'failed', last_error: String(err) })
        .eq('id', job.id);
    }
  }
}

export async function enqueueJobs(
  domainId: number,
  jobTypes: string[],
  priority = 5
): Promise<void> {
  const supabase = createServiceClient();

  const jobs = jobTypes.map((job_type) => ({
    domain_id: domainId,
    job_type,
    status: 'queued',
    priority,
    scheduled_at: new Date().toISOString(),
  }));

  await supabase.from('enrichment_jobs').insert(jobs);
}
