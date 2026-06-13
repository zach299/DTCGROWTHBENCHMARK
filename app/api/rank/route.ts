import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// Single company's Growth Rank within the enriched dataset (ranked by active
// Meta ads — the core, broadly-available signal).
export const maxDuration = 15;

export async function POST(request: Request) {
  let body: { domain?: string; active_meta_ads?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const supabase = createServiceClient();
  try {
    let target = body.active_meta_ads;
    if (target == null && body.domain) {
      const { data } = await supabase
        .from('company_meta_signals')
        .select('active_meta_ads')
        .eq('domain', body.domain.replace(/^www\./i, ''))
        .maybeSingle();
      target = Number(data?.active_meta_ads ?? 0);
    }
    target = Number(target ?? 0);

    const { count: total } = await supabase
      .from('company_meta_signals')
      .select('*', { count: 'exact', head: true });
    const { count: higher } = await supabase
      .from('company_meta_signals')
      .select('*', { count: 'exact', head: true })
      .gt('active_meta_ads', target);

    const t = total ?? 0;
    const rank = (higher ?? 0) + 1;
    const percentile_top = t > 0 ? Math.max(1, Math.ceil((rank / t) * 100)) : null;
    return NextResponse.json({ rank, total: t, percentile_top });
  } catch (err) {
    logger.error('rank failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ rank: null, total: 0, percentile_top: null });
  }
}
