import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  const supabase = createServiceClient();

  let query = supabase
    .from('enrichment_jobs')
    .select(`
      id, domain_id, job_type, status, attempts,
      last_error, scheduled_at, started_at, completed_at,
      domains(domain)
    `)
    .order('scheduled_at', { ascending: false })
    .limit(100);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = (data ?? []).map((j: Record<string, unknown>) => ({
    ...j,
    domain: (j.domains as Record<string, string> | null)?.domain,
  }));

  return NextResponse.json({ jobs });
}
