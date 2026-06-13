import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';

const bodySchema = z.object({
  domain: z.string().min(1),
});

interface MasterRow {
  id: number;
  domain: string;
  average_product_price: string | null;
  categories: string | null;
  // Stored as text in master_database, e.g. "54500"
  combined_followers: string | null;
  company_location: string | null;
  // Stored as text, e.g. "USD $127,836,522.84"
  estimated_yearly_sales: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  platform: string | null;
  tiktok_url: string | null;
}

function parseNumeric(value: string | null): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

// TODO: replace placeholder scoring with Claude + enrichment signals
function placeholderScore(company: MasterRow) {
  const followers = parseNumeric(company.combined_followers);
  const sales = parseNumeric(company.estimated_yearly_sales);

  let score = 0;
  const reasons: string[] = [];

  // Followers (log-scale buckets, up to 35 points)
  if (followers > 0) {
    score += Math.min(35, Math.round(Math.log10(followers) * 7));
    const fmt =
      followers >= 1_000_000
        ? `${(followers / 1_000_000).toFixed(1)}M`
        : followers >= 1_000
          ? `${Math.round(followers / 1_000)}K`
          : `${followers}`;
    reasons.push(
      followers >= 100_000
        ? `Strong social following: ${fmt} combined followers`
        : `Social following: ${fmt} combined followers`
    );
  } else {
    reasons.push('No social follower data available');
  }

  // Estimated yearly sales (up to 30 points)
  if (sales > 0) {
    score += Math.min(30, Math.round(Math.log10(sales) * 4));
    const fmt =
      sales >= 1_000_000
        ? `$${(sales / 1_000_000).toFixed(1)}M`
        : `$${Math.round(sales / 1_000)}K`;
    reasons.push(`Estimated yearly sales: ${fmt}`);
  }

  // Social channel presence (5 points each)
  const channels: string[] = [];
  if (company.instagram_url) channels.push('Instagram');
  if (company.facebook_url) channels.push('Facebook');
  if (company.tiktok_url) channels.push('TikTok');
  score += channels.length * 5;
  if (channels.length > 0) {
    reasons.push(`Active on ${channels.length} social channel${channels.length > 1 ? 's' : ''}: ${channels.join(', ')}`);
  }

  // Platform bonus
  const platform = (company.platform ?? '').toLowerCase();
  if (platform.includes('shopify')) {
    score += 10;
    reasons.push('Runs on Shopify');
  } else if (company.platform) {
    reasons.push(`Ecommerce platform: ${company.platform}`);
  }

  const growth_score = clamp(score);
  const paid_media_signal =
    growth_score >= 70 ? 'high' : growth_score >= 40 ? 'medium' : 'low';

  // Northbeam fit: growth score adjusted by sales data presence
  const northbeam_fit_score = clamp(
    growth_score + (sales >= 5_000_000 ? 15 : sales > 0 ? 5 : -10)
  );

  const category = company.categories?.split(/[,;|/]/)[0]?.trim() || 'DTC';
  const recommended_buyer = 'VP Growth / Head of Performance Marketing';
  const recommended_angle = `Help their ${category} brand scale paid acquisition with better attribution and incrementality measurement.`;
  const followerHook =
    followers > 0
      ? `With ${followers.toLocaleString()} combined social followers`
      : `As a ${company.platform || 'DTC'} brand`;
  const outbound_hook = `${followerHook}, ${company.domain} is well positioned to scale paid media — but most brands at this stage are flying blind on attribution.`;

  return {
    growth_score,
    northbeam_fit_score,
    paid_media_signal,
    recommended_buyer,
    recommended_angle,
    outbound_hook,
    reasons: reasons.slice(0, 5),
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body: "domain" is required' },
      { status: 400 }
    );
  }

  const rawDomain = parsed.data.domain;
  const domain = normalizeDomain(rawDomain);
  const supabase = createServiceClient();

  try {
    // Look up in master_database (normalized first, then as-is)
    let { data: company } = await supabase
      .from('master_database')
      .select('*')
      .eq('domain', domain)
      .maybeSingle<MasterRow>();

    if (!company && rawDomain !== domain) {
      const res = await supabase
        .from('master_database')
        .select('*')
        .eq('domain', rawDomain)
        .maybeSingle<MasterRow>();
      company = res.data;
    }

    if (!company) {
      return NextResponse.json(
        { error: 'Domain not found in database', domain },
        { status: 404 }
      );
    }

    // Check cache
    const { data: cached } = await supabase
      .from('domain_analyses')
      .select('*')
      .eq('master_database_id', company.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({
        domain: company.domain,
        growth_score: cached.growth_score,
        northbeam_fit_score: cached.northbeam_fit_score,
        paid_media_signal: cached.paid_media_signal,
        recommended_buyer: cached.recommended_buyer,
        recommended_angle: cached.recommended_angle,
        outbound_hook: cached.outbound_hook,
        reasons: cached.reasons,
        cached: true,
        company,
      });
    }

    // TODO: replace placeholder scoring with Claude + enrichment signals
    const analysis = placeholderScore(company);

    const { error: insertError } = await supabase.from('domain_analyses').insert({
      domain: company.domain,
      master_database_id: company.id,
      growth_score: analysis.growth_score,
      northbeam_fit_score: analysis.northbeam_fit_score,
      paid_media_signal: analysis.paid_media_signal,
      recommended_buyer: analysis.recommended_buyer,
      recommended_angle: analysis.recommended_angle,
      outbound_hook: analysis.outbound_hook,
      reasons: analysis.reasons,
      raw_response: { method: 'placeholder-heuristic-v1', inputs: company },
    });

    if (insertError) {
      logger.error('Failed to insert domain analysis', { error: insertError.message });
    }

    return NextResponse.json({
      domain: company.domain,
      ...analysis,
      cached: false,
      company,
    });
  } catch (err) {
    logger.error('analyze-domain failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
