import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

export const LISTS = ['Prospects', 'Clients', 'Competitors'] as const;

const addSchema = z.object({
  domain: z.string().min(1),
  brand_name: z.string().optional(),
  list_name: z.enum(LISTS).default('Prospects'),
});

const removeSchema = z.object({
  domain: z.string().min(1),
  list_name: z.enum(LISTS),
});

// GET — list all watchlist items, each enriched with its latest snapshot
// metrics (growth score / momentum / ad counts) so the MCP server can answer
// "which saved companies are accelerating / above 90 / gaining ad activity".
export async function GET() {
  const supabase = createServiceClient();
  try {
    const { data: items, error } = await supabase
      .from('watchlist_items')
      .select('*')
      .order('added_at', { ascending: false });
    if (error) throw error;
    const list = items ?? [];

    const domains = [...new Set(list.map((i) => i.domain))];
    const latest = new Map<string, Record<string, unknown>>();
    if (domains.length) {
      // Prefer bulk signals (company_meta_signals) over snapshots — they're richer
      // and more current for the majority of saved companies.
      const { data: sigs } = await supabase
        .from('company_meta_signals')
        .select('domain, growth_score, growth_momentum, active_meta_ads, estimated_revenue_range')
        .in('domain', domains);
      for (const s of sigs ?? []) {
        latest.set(s.domain as string, {
          growth_score: s.growth_score,
          growth_momentum: s.growth_momentum,
          active_meta_ads: s.active_meta_ads,
          revenue_range: s.estimated_revenue_range,
        });
      }
      // Fill any gaps with snapshot data.
      const missing = domains.filter((d) => !latest.has(d));
      if (missing.length) {
        const { data: snaps } = await supabase
          .from('domain_snapshots')
          .select('domain, growth_score, growth_momentum, active_meta_ads, revenue_range')
          .in('domain', missing)
          .order('snapshot_date', { ascending: false });
        for (const s of snaps ?? []) {
          if (!latest.has(s.domain as string)) latest.set(s.domain as string, s);
        }
      }
    }

    const enriched = list.map((it) => ({ ...it, latest: latest.get(it.domain) ?? null }));
    return NextResponse.json({ items: enriched, lists: LISTS });
  } catch (err) {
    logger.error('watchlist GET failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ items: [], lists: LISTS });
  }
}

// POST — add a company to a list (idempotent on domain+list).
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'domain and valid list_name required' }, { status: 400 });
  }
  const supabase = createServiceClient();
  try {
    const { error } = await supabase
      .from('watchlist_items')
      .upsert(
        {
          domain: parsed.data.domain,
          brand_name: parsed.data.brand_name ?? null,
          list_name: parsed.data.list_name,
        },
        { onConflict: 'domain,list_name', ignoreDuplicates: true }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('watchlist POST failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

// DELETE — remove a company from a list.
export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'domain and list_name required' }, { status: 400 });
  }
  const supabase = createServiceClient();
  try {
    const { error } = await supabase
      .from('watchlist_items')
      .delete()
      .eq('domain', parsed.data.domain)
      .eq('list_name', parsed.data.list_name);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('watchlist DELETE failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Failed to remove' }, { status: 500 });
  }
}
