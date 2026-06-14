import { NextResponse } from 'next/server';

// TEMPORARY diagnostic: runs the raw Meta Ad Library keyword search via Apify
// and returns the actor's actual output shape, so we can verify how page_id /
// page_name / total are represented. Hit e.g. /api/debug-meta?q=gymshark
// Remove once the scraper field mapping is confirmed.
export const maxDuration = 120;

export async function GET(request: Request) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: 'APIFY_TOKEN not set' }, { status: 500 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q') || 'gymshark';
  const actorId = process.env.APIFY_META_ADS_ACTOR_ID || 'curious_coder~facebook-ads-library-scraper';

  const searchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=${encodeURIComponent(q)}&search_type=keyword_unordered`;
  const endpoint =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&timeout=90&memory=512`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [{ url: searchUrl }], count: 5, scrapeAdDetails: false, period: '' }),
      signal: AbortSignal.timeout(95_000),
    });
    const status = res.status;
    const json = (await res.json().catch(() => null)) as unknown;
    const items = Array.isArray(json) ? json : [];
    const first = items[0] as Record<string, unknown> | undefined;

    return NextResponse.json({
      query: q,
      http_status: status,
      item_count: items.length,
      // Top-level keys so we can see how the schema names page_id/page_name/total.
      first_item_keys: first ? Object.keys(first) : [],
      // A trimmed view of the first item (drop heavy fields).
      first_item_sample: first
        ? Object.fromEntries(
            Object.entries(first).map(([k, v]) => [
              k,
              typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v,
            ])
          )
        : null,
      raw_if_not_array: Array.isArray(json) ? undefined : json,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}
