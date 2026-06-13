import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

const CAREERS_PATHS = ['/careers', '/jobs', '/pages/careers', '/pages/jobs', '/about/careers'];

const GROWTH_KEYWORDS = [
  'performance marketing',
  'paid social',
  'growth',
  'lifecycle',
  'retention',
  'acquisition',
  'media buyer',
  'demand generation',
  'paid media',
  'user acquisition',
];

function extractRolesTitles(html: string): string[] {
  // Simple heuristic: look for common job title patterns
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const roles: string[] = [];

  // Look for common patterns like "Senior X Manager", "Head of X", "Director of X"
  const patterns = [
    /\b(Senior|Junior|Lead|Head of|Director of|VP of|Manager,? \w+|Specialist in \w+)\s+[\w\s]+(?=\s*[-–|]|\s{2,}|$)/gi,
    /\b(Growth|Marketing|Acquisition|Retention|Performance|Lifecycle|eCommerce|DTC)\s+\w+\b/gi,
  ];

  for (const pat of patterns) {
    const matches = stripped.match(pat) ?? [];
    roles.push(...matches.slice(0, 20));
  }

  return [...new Set(roles)].slice(0, 30);
}

function countGrowthJobs(html: string): number {
  const lower = html.toLowerCase();
  let count = 0;
  for (const kw of GROWTH_KEYWORDS) {
    // rough count of occurrences
    const matches = lower.match(new RegExp(kw, 'g')) ?? [];
    if (matches.length > 0) count++;
  }
  return count;
}

export async function runHiringEnrichment(domainId: number, domain: string): Promise<void> {
  logger.info('Running hiring enrichment', { domain, domainId });

  let bestHtml = '';
  let careersUrl = '';

  for (const path of CAREERS_PATHS) {
    const url = `https://${domain}${path}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrowthSignalsBot/1.0)' },
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });
      if (res.ok) {
        bestHtml = await res.text();
        careersUrl = url;
        break;
      }
    } catch {
      // Try next path
    }
  }

  const roles = bestHtml ? extractRolesTitles(bestHtml) : [];
  const growthJobsCount = bestHtml ? countGrowthJobs(bestHtml) : 0;

  // Rough total jobs count - count common job-listing indicators
  const jobsCount = bestHtml
    ? (bestHtml.match(/job-listing|job-card|job_listing|position|opening/gi) ?? []).length
    : 0;

  const supabase = createServiceClient();
  await supabase.from('hiring_snapshots').insert({
    domain_id: domainId,
    jobs_count: jobsCount || null,
    growth_jobs_count: growthJobsCount || null,
    roles: roles.length > 0 ? roles : null,
    careers_url: careersUrl || null,
    raw: { paths_tried: CAREERS_PATHS, careers_url: careersUrl },
    checked_at: new Date().toISOString(),
  });

  logger.info('Hiring enrichment complete', { domain, domainId, careersUrl, growthJobsCount });
}
