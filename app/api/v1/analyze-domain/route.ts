import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { enqueueJobs } from '@/lib/enrichment/jobProcessor';
import { runSiteEnrichment } from '@/lib/enrichment/siteWorker';
import { runScoreEnrichment } from '@/lib/enrichment/scoreWorker';
import { logger } from '@/lib/utils/logger';

const Schema = z.object({
  domain: z.string().min(1),
  refresh: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { domain: rawDomain, refresh } = parsed.data;
  const domain = normalizeDomain(rawDomain);

  const supabase = createServiceClient();

  // Look up or create domain
  let { data: domainRow } = await supabase
    .from('domains')
    .select('id, domain, company_name, category, ecommerce_platform, estimated_revenue')
    .eq('domain', domain)
    .single();

  if (!domainRow) {
    const { data: inserted } = await supabase
      .from('domains')
      .insert({ domain, normalized_domain: domain, source: 'user_submitted' })
      .select('id, domain, company_name, category, ecommerce_platform, estimated_revenue')
      .single();
    domainRow = inserted;
    logger.info('Created new domain', { domain });
  }

  if (!domainRow) {
    return NextResponse.json({ error: 'Failed to create domain' }, { status: 500 });
  }

  const domainId = domainRow.id;

  // Get latest score
  const { data: score } = await supabase
    .from('growth_scores')
    .select('*')
    .eq('domain_id', domainId)
    .single();

  if (refresh) {
    await enqueueJobs(domainId, ['site', 'hiring', 'meta_ads', 'score'], 8);
    return NextResponse.json({
      domain,
      status: 'queued',
      message: 'Enrichment jobs enqueued. Check back shortly.',
      growth_score: score?.score ?? null,
    });
  }

  // If no score, run lightweight sync enrichment
  if (!score) {
    try {
      await runSiteEnrichment(domainId, domain);
      await runScoreEnrichment(domainId);

      const { data: newScore } = await supabase
        .from('growth_scores')
        .select('*')
        .eq('domain_id', domainId)
        .single();

      if (newScore) {
        return buildScoreResponse(domain, newScore);
      }
    } catch (err) {
      logger.warn('Sync enrichment failed, enqueueing async', { domain, err: String(err) });
      await enqueueJobs(domainId, ['site', 'hiring', 'meta_ads', 'score'], 7);
      return NextResponse.json({
        domain,
        status: 'queued',
        message: 'Scoring queued. Check back in a few minutes.',
      });
    }
  }

  if (!score) {
    return NextResponse.json({ domain, status: 'no_data', message: 'No score available yet.' });
  }

  return buildScoreResponse(domain, score);
}

function buildScoreResponse(domain: string, score: Record<string, unknown>) {
  return NextResponse.json({
    domain,
    growth_score: score.score,
    paid_media_signal: score.paid_media_signal,
    social_signal: score.social_signal,
    hiring_signal: score.hiring_signal,
    site_signal: score.site_signal,
    signals: score.reasons ?? [],
    summary: score.summary,
    recommended_buyer: score.recommended_buyer,
    recommended_angle: score.recommended_angle,
    outbound_hook: score.outbound_hook,
    last_updated: score.calculated_at,
  });
}
