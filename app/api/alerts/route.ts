import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';

// Growth alerts, computed on read from snapshot deltas (no queue infra yet —
// documented in DECISIONS.md). For the given domains (a rep's book of
// business / watchlist), compare the two most recent snapshots per domain:
//   - entered_exploding: momentum moved into Exploding
//   - score_jump: growth score rose 10+ points
//   - entered_top1pct: score crossed the current top-1% threshold
export const maxDuration = 30;

const bodySchema = z.object({ domains: z.array(z.string().min(1)).min(1).max(500) });

interface Alert {
  domain: string;
  type: 'entered_exploding' | 'score_jump' | 'entered_top1pct';
  headline: string;
  detail: string;
  observed_at: string; // snapshot date of the newer point
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'domains[] required' }, { status: 400 });

  const domains = [...new Set(parsed.data.domains.map(normalizeDomain).filter(Boolean))];
  const supabase = createServiceClient();

  try {
    // Top-1% threshold from the ranked universe.
    const { count: total } = await supabase
      .from('company_meta_signals')
      .select('domain', { count: 'exact', head: true })
      .not('growth_score', 'is', null);
    const cut = Math.max(1, Math.ceil((total ?? 0) * 0.01));
    const { data: cutRow } = await supabase
      .from('company_meta_signals')
      .select('growth_score')
      .not('growth_score', 'is', null)
      .order('growth_score', { ascending: false })
      .range(cut - 1, cut - 1);
    const top1Threshold = cutRow?.[0]?.growth_score != null ? Number(cutRow[0].growth_score) : null;

    // Last two snapshots per domain (chunked fetch, newest first, trim in JS).
    const alerts: Alert[] = [];
    for (let i = 0; i < domains.length; i += 100) {
      const chunk = domains.slice(i, i + 100);
      const { data: snaps } = await supabase
        .from('domain_snapshots')
        .select('domain, snapshot_date, growth_score, growth_momentum')
        .in('domain', chunk)
        .order('snapshot_date', { ascending: false })
        .limit(chunk.length * 4);
      const byDomain = new Map<string, { date: string; score: number; momentum: string | null }[]>();
      for (const s of snaps ?? []) {
        const list = byDomain.get(s.domain as string) ?? [];
        if (list.length < 2) {
          list.push({
            date: String(s.snapshot_date),
            score: Number(s.growth_score ?? 0),
            momentum: (s.growth_momentum as string) ?? null,
          });
          byDomain.set(s.domain as string, list);
        }
      }
      for (const [domain, pts] of byDomain) {
        if (pts.length < 2) continue;
        const [curr, prev] = pts;
        if (curr.momentum === 'Exploding' && prev.momentum !== 'Exploding') {
          alerts.push({
            domain,
            type: 'entered_exploding',
            headline: `${domain} entered Exploding momentum`,
            detail: `Momentum moved ${prev.momentum ?? 'unknown'} → Exploding between ${prev.date} and ${curr.date}.`,
            observed_at: curr.date,
          });
        }
        if (curr.score - prev.score >= 10) {
          alerts.push({
            domain,
            type: 'score_jump',
            headline: `${domain} growth score jumped +${Math.round(curr.score - prev.score)}`,
            detail: `Score ${prev.score} → ${curr.score} between ${prev.date} and ${curr.date}.`,
            observed_at: curr.date,
          });
        }
        if (top1Threshold != null && curr.score >= top1Threshold && prev.score < top1Threshold) {
          alerts.push({
            domain,
            type: 'entered_top1pct',
            headline: `${domain} entered the top 1%`,
            detail: `Crossed the top-1% growth threshold (score ${curr.score} ≥ ${top1Threshold}).`,
            observed_at: curr.date,
          });
        }
      }
    }

    alerts.sort((a, b) => b.observed_at.localeCompare(a.observed_at));
    return NextResponse.json({ alerts, top1_threshold: top1Threshold, checked: domains.length });
  } catch (err) {
    logger.error('alerts failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Alerts computation failed' }, { status: 500 });
  }
}
