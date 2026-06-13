import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';

// Accepts one chunk of CSV rows from the browser and upserts them into
// master_database. The client parses the file and POSTs in batches, so this
// route never has to hold a large payload — and upsert-on-domain means
// re-uploading or overlapping chunks can't throw a duplicate-key error.
export const maxDuration = 30;

// Only columns master_database actually has. Extras in the CSV are ignored.
const ALLOWED = [
  'domain', 'average_product_price', 'categories', 'combined_followers',
  'company_location', 'estimated_yearly_sales', 'facebook_url',
  'instagram_url', 'platform', 'tiktok_url',
] as const;

const rowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));
const bodySchema = z.object({ rows: z.array(rowSchema).min(1).max(1000) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Expected { rows: [...] } (max 1000)' }, { status: 400 });
  }

  // Keep only allowed columns; normalize the domain (strip protocol/www/path)
  // so different forms of the same site collapse to one row; drop blanks.
  // De-dupe within this batch too, so a single upsert can't hit the same domain
  // twice (Postgres rejects that).
  const byDomain = new Map<string, Record<string, unknown>>();
  let skipped = 0;
  for (const raw of parsed.data.rows) {
    const rec: Record<string, unknown> = {};
    for (const col of ALLOWED) {
      const v = raw[col];
      rec[col] = v === '' || v === undefined ? null : v;
    }
    const domain = typeof rec.domain === 'string' ? normalizeDomain(rec.domain) : '';
    if (!domain) { skipped++; continue; }
    rec.domain = domain;
    byDomain.set(domain, rec); // last write wins within the batch
  }
  const clean = [...byDomain.values()];
  if (clean.length === 0) {
    return NextResponse.json({ upserted: 0, skipped });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('master_database')
    .upsert(clean, { onConflict: 'domain', ignoreDuplicates: false });

  if (error) {
    logger.error('import-master upsert failed', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ upserted: clean.length, skipped });
}
