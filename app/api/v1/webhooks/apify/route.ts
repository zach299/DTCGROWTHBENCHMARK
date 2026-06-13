import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/utils/domain';
import { logger } from '@/lib/utils/logger';

// Apify webhook receiver
// Configure in Apify: POST to /api/v1/webhooks/apify with your actor run data
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // TODO: Verify Apify webhook signature if needed
  // Apify may send a secret in headers; validate here for production

  logger.info('Received Apify webhook', { body: JSON.stringify(body).slice(0, 200) });

  const payload = body as Record<string, unknown>;
  const resourceId = payload?.resource ? (payload.resource as Record<string, unknown>)?.id : payload?.runId;
  const status = payload?.resource ? (payload.resource as Record<string, unknown>)?.status : payload?.status;
  const datasetId = payload?.resource ? (payload.resource as Record<string, unknown>)?.defaultDatasetId : payload?.datasetId;

  if (!datasetId || status !== 'SUCCEEDED') {
    logger.info('Apify webhook: run not succeeded or no dataset', { status, datasetId });
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Fetch the dataset items
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: 'APIFY_TOKEN not configured' }, { status: 500 });

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`
  );
  const items: unknown[] = await itemsRes.json();

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ ok: true, message: 'Empty dataset' });
  }

  // TODO: Map webhook payload to domain
  // The actor run should store the domain in the run's name or input
  // For now, try to extract domain from the first item
  const firstItem = items[0] as Record<string, unknown>;
  const rawDomain =
    firstItem?.domain ??
    firstItem?.page_url ??
    firstItem?.advertiser_profile_link;

  if (!rawDomain || typeof rawDomain !== 'string') {
    logger.warn('Could not extract domain from Apify webhook payload');
    return NextResponse.json({ ok: true, message: 'Could not determine domain' });
  }

  const domain = normalizeDomain(rawDomain);
  const supabase = createServiceClient();

  const { data: domainRow } = await supabase
    .from('domains')
    .select('id')
    .eq('domain', domain)
    .single();

  if (!domainRow) {
    logger.warn('Domain not found for Apify webhook', { domain });
    return NextResponse.json({ ok: true, message: 'Domain not found' });
  }

  // Insert ad snapshot from webhook data
  await supabase.from('ad_snapshots').insert({
    domain_id: domainRow.id,
    platform: 'meta',
    active_ads_count: items.length,
    sample_ads: items.slice(0, 5),
    raw: items,
    checked_at: new Date().toISOString(),
  });

  logger.info('Apify webhook processed', { domain, itemCount: items.length, runId: resourceId });
  return NextResponse.json({ ok: true, domain, items_processed: items.length });
}
