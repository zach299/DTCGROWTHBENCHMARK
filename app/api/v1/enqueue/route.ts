import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { enqueueJobs } from '@/lib/enrichment/jobProcessor';

const Schema = z.object({
  domain: z.string().min(1),
  job_types: z.array(z.enum(['meta_ads', 'site', 'hiring', 'score'])).default(['site', 'score']),
  priority: z.number().int().min(1).max(10).optional().default(5),
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

  const { domain: rawDomain, job_types, priority } = parsed.data;
  const domain = normalizeDomain(rawDomain);

  const supabase = createServiceClient();

  let { data: domainRow } = await supabase
    .from('domains')
    .select('id')
    .eq('domain', domain)
    .single();

  if (!domainRow) {
    const { data: inserted } = await supabase
      .from('domains')
      .insert({ domain, normalized_domain: domain, source: 'user_submitted' })
      .select('id')
      .single();
    domainRow = inserted;
  }

  if (!domainRow) {
    return NextResponse.json({ error: 'Failed to find or create domain' }, { status: 500 });
  }

  await enqueueJobs(domainRow.id, job_types, priority);

  return NextResponse.json({
    domain,
    queued: job_types,
    message: `Enqueued ${job_types.length} job(s) for ${domain}`,
  });
}
