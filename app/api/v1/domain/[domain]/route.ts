import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';

export async function GET(req: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const auth = await requireApiKey(req);
  if ('error' in auth) return auth.error;

  const { domain: rawDomain } = await params;
  const domain = normalizeDomain(decodeURIComponent(rawDomain));

  const supabase = createServiceClient();

  const { data: domainRow } = await supabase
    .from('domains')
    .select('*')
    .eq('domain', domain)
    .single();

  if (!domainRow) {
    return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
  }

  const [socialsRes, adSnapRes, siteSnapRes, hiringSnapRes, scoreRes] = await Promise.all([
    supabase.from('domain_social_profiles').select('*').eq('domain_id', domainRow.id),
    supabase
      .from('ad_snapshots')
      .select('*')
      .eq('domain_id', domainRow.id)
      .order('checked_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('site_snapshots')
      .select('*')
      .eq('domain_id', domainRow.id)
      .order('checked_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('hiring_snapshots')
      .select('*')
      .eq('domain_id', domainRow.id)
      .order('checked_at', { ascending: false })
      .limit(1)
      .single(),
    supabase.from('growth_scores').select('*').eq('domain_id', domainRow.id).single(),
  ]);

  return NextResponse.json({
    domain: domainRow,
    social_profiles: socialsRes.data ?? [],
    ad_snapshot: adSnapRes.data,
    site_snapshot: siteSnapRes.data,
    hiring_snapshot: hiringSnapRes.data,
    growth_score: scoreRes.data,
  });
}
