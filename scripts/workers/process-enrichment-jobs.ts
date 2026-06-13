#!/usr/bin/env tsx
import 'dotenv/config';
import { processEnrichmentJobs } from '../../lib/enrichment/jobProcessor';
import { logger } from '../../lib/utils/logger';

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20;

  logger.info('Worker: starting enrichment job processor', { limit });
  await processEnrichmentJobs(limit);
  logger.info('Worker: done');
}

main().catch((err) => {
  logger.error('Worker fatal error', { err: String(err) });
  process.exit(1);
});
