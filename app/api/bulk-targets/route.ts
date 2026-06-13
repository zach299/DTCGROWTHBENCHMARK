import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// Returns the next batch of top Shopify domains that still need Meta enrichment
// (used by the in-UI bulk runner).
export const maxDuration = 30;

const SOURCE_TABLE = process.env.SOURCE_TABLE || 'master_database';
const SALES_COLUMN = process.env.SALES_COLUMN || 'estimated_yearly_sales';
const PLATFORM = process.env.PLATFORM || 'shopify';

const schema = z.object({ limit: z.number().min(1).max(1000).default(50) });

function parseSales(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const limit = schema.parse(body ?? {}).limit;
  const supabase = createServiceClient();

  try {
    // Fetch a buffer, sort numerically (sales column may be text), skip recently
    // enriched, then take the top N.
    const { data: rows, error } = await supabase
      .from(SOURCE_TABLE)
      .select('domain, company_name, facebook_url, ' + SALES_COLUMN)
      .ilike('platform', `%${PLATFORM}%`)
      .order(SALES_COLUMN, { ascending: false })
      .limit(limit * 8);
    if (error) {
      // company_name/facebook_url may not exist in the source — retry minimal.
      const retry = await supabase
        .from(SOURCE_TABLE)
        .select('domain, ' + SALES_COLUMN)
        .ilike('platform', `%${PLATFORM}%`)
        .order(SALES_COLUMN, { ascending: false })
        .limit(limit * 8);
      if (retry.error) throw retry.error;
      return await build(supabase, (retry.data ?? []) as unknown as Record<string, unknown>[], limit);
    }
    return await build(supabase, (rows ?? []) as unknown as Record<string, unknown>[], limit);
  } catch (err) {
    logger.error('bulk-targets failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ targets: [] }, { status: 500 });
  }

  async function build(sb: ReturnType<typeof createServiceClient>, rows: Record<string, unknown>[], n: number) {
    const sorted = [...rows].sort((a, b) => parseSales(b[SALES_COLUMN]) - parseSales(a[SALES_COLUMN]));
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: recent } = await sb
      .from('company_meta_signals')
      .select('domain')
      .gte('last_enriched_at', cutoff);
    const skip = new Set((recent ?? []).map((r) => r.domain as string));
    const targets = sorted
      .filter((r) => r.domain && !skip.has(r.domain as string))
      .slice(0, n)
      .map((r) => ({
        domain: r.domain as string,
        company_name: (r.company_name as string) ?? null,
        facebook_url: (r.facebook_url as string) ?? null,
      }));
    return NextResponse.json({ targets });
  }
}
