import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// Track an in-UI bulk run in enrichment_jobs. POST without job_id starts a job;
// POST with job_id updates/finalizes it.
export const maxDuration = 15;

const schema = z.object({
  job_id: z.number().optional(),
  domains_processed: z.number().optional(),
  domains_successful: z.number().optional(),
  domains_failed: z.number().optional(),
  estimated_cost: z.number().optional(),
  done: z.boolean().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsedBody = schema.safeParse(body ?? {});
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const p = parsedBody.data;
  const supabase = createServiceClient();
  try {
    if (!p.job_id) {
      const { data } = await supabase
        .from('enrichment_jobs')
        .insert({ notes: 'in-UI bulk meta run' })
        .select('job_id')
        .single();
      return NextResponse.json({ job_id: data?.job_id });
    }
    const update: Record<string, unknown> = {};
    if (p.domains_processed != null) update.domains_processed = p.domains_processed;
    if (p.domains_successful != null) update.domains_successful = p.domains_successful;
    if (p.domains_failed != null) update.domains_failed = p.domains_failed;
    if (p.estimated_cost != null) update.estimated_cost = p.estimated_cost;
    if (p.done) update.completed_at = new Date().toISOString();
    await supabase.from('enrichment_jobs').update(update).eq('job_id', p.job_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('bulk-job failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
