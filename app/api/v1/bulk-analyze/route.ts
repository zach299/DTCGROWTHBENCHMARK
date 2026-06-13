import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { enqueueJobs } from '@/lib/enrichment/jobProcessor';
import { logger } from '@/lib/utils/logger';

const Schema = z.object({
  domains: z.array(z.string().min(1)).min(1).max(100),
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

  const { domains: rawDomains, refresh } = parsed.data;
  const domains = rawDomains.map(normalizeDomain);

  const supabase = createServiceClient();

  // Look up all domains in one query
  const { data: existing } = await supabase
    .from('domains')
    .select('id, domain')
    .in('domain', domains);

  const existingMap = new Map((existing ?? []).map((d: { id: number; domain: string }) => [d.domain, d.id]));

  // Insert missing domains
  const missing = domains.filter((d) => !existingMap.has(d));
  if (missing.length > 0) {
    const { data: inserted } = await supabase
      .from('domains')
      .insert(missing.map((d) => ({ domain: d, normalized_domain: d, source: 'user_submitted' })))
      .select('id, domain');
    for (const row of inserted ?? []) {
      existingMap.set(row.domain, row.id);
    }
  }

  // Get scores for all domains
  const domainIds = Array.from(existingMap.values());
  const { data: scores } = await supabase
    .from('growth_scores')
    .select('*')
    .in('domain_id', domainIds);

  const scoreByDomainId = new Map((scores ?? []).map((s: Record<string, unknown>) => [s.domain_id, s]));

  // Enqueue missing scores
  const results = await Promise.all(
    domains.map(async (domain) => {
      const domainId = existingMap.get(domain);
      if (!domainId) return { domain, status: 'error', message: 'Failed to create domain' };

      const score = scoreByDomainId.get(domainId);

      if (!score || refresh) {
        await enqueueJobs(domainId, ['site', 'hiring', 'meta_ads', 'score'], 5);
        return {
          domain,
          status: score ? 'refresh_queued' : 'queued',
          growth_score: score?.score ?? null,
        };
      }

      return {
        domain,
        status: 'scored',
        growth_score: score.score,
        paid_media_signal: score.paid_media_signal,
        signals: score.reasons ?? [],
        recommended_buyer: score.recommended_buyer,
        outbound_hook: score.outbound_hook,
        last_updated: score.calculated_at,
      };
    })
  );

  logger.info('Bulk analyze complete', { count: domains.length });
  return NextResponse.json({ results });
}
