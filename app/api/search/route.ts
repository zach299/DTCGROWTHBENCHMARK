import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

// search_companies — match master_database rows by domain substring. Used by
// the MCP server ("which companies look like X", "tell me about Ridge").
export const maxDuration = 15;

const schema = z.object({ query: z.string().min(1), limit: z.number().optional() });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'query required' }, { status: 400 });

  // Sanitize for PostgREST .ilike(): escape LIKE wildcards and strip filter
  // grammar characters (`,()` can break out of the filter value entirely).
  const q = parsed.data.query
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[,()*]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, (m) => `\\${m}`)
    .slice(0, 100);
  if (!q) return NextResponse.json({ results: [] });
  const limit = Math.min(parsed.data.limit ?? 10, 25);
  const supabase = createServiceClient();

  try {
    const { data, error } = await supabase
      .from('master_database')
      .select('domain, categories, company_location, estimated_yearly_sales, platform')
      .ilike('domain', `%${q}%`)
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ results: data ?? [] });
  } catch (err) {
    logger.error('search failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ results: [] });
  }
}
