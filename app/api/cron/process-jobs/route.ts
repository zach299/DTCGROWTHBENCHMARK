import { NextRequest, NextResponse } from 'next/server';
import { processEnrichmentJobs } from '@/lib/enrichment/jobProcessor';
import { logger } from '@/lib/utils/logger';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Cron: processing enrichment jobs');
  await processEnrichmentJobs(20);
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
