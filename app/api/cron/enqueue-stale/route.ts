import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { enqueueJobs } from '@/lib/enrichment/jobProcessor';
import { logger } from '@/lib/utils/logger';

// Enqueue refresh jobs for domains with stale scores (>7 days old) that have high scores
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find high-scoring domains with stale data
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleScores } = await supabase
    .from('growth_scores')
    .select('domain_id, score, calculated_at')
    .gte('score', 70)
    .lt('calculated_at', sevenDaysAgo)
    .limit(50);

  if (!staleScores || staleScores.length === 0) {
    return NextResponse.json({ ok: true, enqueued: 0 });
  }

  let enqueued = 0;
  for (const row of staleScores) {
    await enqueueJobs(row.domain_id, ['site', 'hiring', 'meta_ads', 'score'], 3);
    enqueued++;
  }

  logger.info('Cron: enqueued stale domain refreshes', { enqueued });
  return NextResponse.json({ ok: true, enqueued });
}
