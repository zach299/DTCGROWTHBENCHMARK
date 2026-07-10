import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { estimateAdSpend } from '@/lib/adSpend';
import { buildReason, buildOutboundAngle, type ReasonInputs } from '@/lib/reason';
import { trendStatus } from '@/lib/trends';
import { logger } from '@/lib/utils/logger';

// Book-of-business scoring — the rep workflow. POST a list of domains
// (pasted or CSV-parsed client-side); returns each with score, momentum,
// growth investment, and reason. Unknown domains are registered + queued for
// the nightly priority pass so they score within 24h.
export const maxDuration = 30;

const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const bodySchema = z.object({ domains: z.array(z.string().min(1)).min(1).max(500) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'domains[] required (max 500)' }, { status: 400 });

  const supabase = createServiceClient();
  const seen = new Set<string>();
  const domains: string[] = [];
  let invalid = 0;
  for (const raw of parsed.data.domains) {
    const d = normalizeDomain(raw);
    if (!d || d.length > 253 || !VALID_HOST.test(d)) { invalid++; continue; }
    if (!seen.has(d)) { seen.add(d); domains.push(d); }
  }
  if (domains.length === 0) {
    return NextResponse.json({ accounts: [], pending: [], invalid, error: 'No valid domains' }, { status: 400 });
  }

  try {
    // Known signals (chunked IN lists)
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < domains.length; i += 200) {
      const { data } = await supabase
        .from('company_meta_signals')
        .select('domain, company_name, primary_category, estimated_revenue_range, growth_score, growth_momentum, active_meta_ads, google_ads, linkedin_ads, quality_adjusted_ads, creative_diversity_score, real_creative_score, dpa_share, landing_pages, ad_activity_level, last_enriched_at')
        .in('domain', domains.slice(i, i + 200));
      rows.push(...((data ?? []) as Record<string, unknown>[]));
    }
    const byDomain = new Map(rows.map((r) => [r.domain as string, r]));

    // Snapshot counts for trend status
    const snapCounts = new Map<string, number>();
    for (let i = 0; i < domains.length; i += 200) {
      const { data: snaps } = await supabase
        .from('domain_snapshots')
        .select('domain')
        .in('domain', domains.slice(i, i + 200));
      for (const s of snaps ?? []) snapCounts.set(s.domain as string, (snapCounts.get(s.domain as string) ?? 0) + 1);
    }

    const accounts = [];
    const pending: string[] = [];
    const nowIso = new Date().toISOString();

    for (const d of domains) {
      const r = byDomain.get(d);
      if (!r || r.growth_score == null) {
        pending.push(d);
        continue;
      }
      const lps = Array.isArray(r.landing_pages) ? (r.landing_pages as string[]).length : 0;
      const spend = estimateAdSpend({
        metaAds: Number(r.active_meta_ads ?? 0),
        googleAds: Number(r.google_ads ?? 0),
        linkedinAds: Number(r.linkedin_ads ?? 0),
        qualityAdjustedAds: r.quality_adjusted_ads != null ? Number(r.quality_adjusted_ads) : null,
        landingPages: lps,
        creativeDiversityScore: r.creative_diversity_score != null ? Number(r.creative_diversity_score) : null,
        revenueRange: (r.estimated_revenue_range as string) ?? null,
        paidIntensity: (r.ad_activity_level as string) ?? null,
        momentum: (r.growth_momentum as string) ?? null,
      });
      const reasonInputs: ReasonInputs = {
        metaAds: Number(r.active_meta_ads ?? 0),
        creativeDiversityScore: r.creative_diversity_score != null ? Number(r.creative_diversity_score) : null,
        realCreativeScore: r.real_creative_score != null ? Number(r.real_creative_score) : null,
        dpaShare: r.dpa_share != null ? Number(r.dpa_share) : null,
        momentum: (r.growth_momentum as string) ?? null,
        growthScore: Number(r.growth_score),
        spend,
        landingPages: lps,
      };
      const name = (r.company_name as string) || d.split('.')[0];
      accounts.push({
        domain: d,
        company_name: (r.company_name as string) ?? null,
        category: (r.primary_category as string) ?? null,
        revenue_range: (r.estimated_revenue_range as string) ?? null,
        growth_score: Number(r.growth_score),
        growth_momentum: (r.growth_momentum as string) ?? null,
        spend_estimate: spend,
        reason_inputs: reasonInputs, // client re-frames per persona
        reason: buildReason(reasonInputs),
        outbound_angle: buildOutboundAngle(name, reasonInputs),
        snapshot_count: snapCounts.get(d) ?? 0,
        trend_status: trendStatus(snapCounts.get(d) ?? 0),
        last_enriched_at: (r.last_enriched_at as string) ?? null,
      });
    }

    // Register + prioritize pending domains: they score after the next pull.
    if (pending.length > 0) {
      await supabase
        .from('master_database')
        .upsert(pending.map((d) => ({ domain: d, source: 'my_accounts' })), { onConflict: 'domain', ignoreDuplicates: true });
      await supabase
        .from('domain_priority')
        .upsert(pending.map((d) => ({ domain: d, last_viewed_at: nowIso })), { onConflict: 'domain' });
    }

    return NextResponse.json({ accounts, pending, invalid, total: domains.length });
  } catch (err) {
    logger.error('accounts scoring failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 });
  }
}
