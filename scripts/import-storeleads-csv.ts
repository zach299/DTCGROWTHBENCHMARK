#!/usr/bin/env tsx
/**
 * Store Leads CSV Import Pipeline
 *
 * Usage:
 *   npx tsx scripts/import-storeleads-csv.ts --file /path/to/storeleads.csv
 *
 * Flags:
 *   --file         Path to CSV file (required)
 *   --batch-size   Rows per batch (default: 2000)
 *   --limit        Max rows to import (default: unlimited)
 *   --resume-import-id  Resume an existing import by ID
 *   --dry-run      Parse and validate without inserting
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ---- Config ----
const args = process.argv.slice(2);
function getArg(name: string, fallback?: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : fallback;
}

const CSV_FILE = getArg('--file');
const BATCH_SIZE = parseInt(getArg('--batch-size', '2000')!, 10);
const LIMIT = parseInt(getArg('--limit', '0')!, 10) || Infinity;
const RESUME_IMPORT_ID = getArg('--resume-import-id');
const DRY_RUN = args.includes('--dry-run');

if (!CSV_FILE) {
  console.error('Usage: tsx scripts/import-storeleads-csv.ts --file <path>');
  process.exit(1);
}

// ---- Domain normalization ----
function normalizeDomain(raw: string): string {
  let d = (raw ?? '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//i, '');
  d = d.replace(/^www\./i, '');
  const slashIdx = d.indexOf('/');
  if (slashIdx !== -1) d = d.slice(0, slashIdx);
  const queryIdx = d.indexOf('?');
  if (queryIdx !== -1) d = d.slice(0, queryIdx);
  return d;
}

// ---- Store Leads CSV column mapping ----
// TODO: Adjust these mappings based on actual Store Leads CSV column names
// Store Leads may use different column names across exports
function mapRow(row: Record<string, string>): {
  domain: DomainRow;
  socials: SocialRow[];
} | null {
  // Try common column name variants for domain
  const rawDomain =
    row['Domain'] ??
    row['domain'] ??
    row['Website'] ??
    row['website'] ??
    row['URL'] ??
    row['url'] ??
    row['Store URL'] ??
    '';

  if (!rawDomain) return null;

  const domain = normalizeDomain(rawDomain);
  if (!domain || domain.length < 3 || !domain.includes('.')) return null;

  const domainRow: DomainRow = {
    domain,
    normalized_domain: domain,
    root_domain: domain.split('.').slice(-2).join('.'),
    company_name:
      row['Company Name'] ?? row['company_name'] ?? row['Store Name'] ?? row['Name'] ?? null,
    country: row['Country'] ?? row['country'] ?? row['Location'] ?? null,
    category:
      row['Category'] ??
      row['category'] ??
      row['Industry'] ??
      row['Niche'] ??
      row['Store Category'] ??
      null,
    ecommerce_platform:
      row['Platform'] ??
      row['platform'] ??
      row['Ecommerce Platform'] ??
      row['ecommerce_platform'] ??
      null,
    estimated_revenue:
      row['Estimated Revenue'] ??
      row['estimated_revenue'] ??
      row['Revenue'] ??
      row['Annual Revenue'] ??
      null,
    estimated_sales:
      row['Estimated Sales'] ??
      row['estimated_sales'] ??
      row['Monthly Sales'] ??
      row['Sales'] ??
      null,
    estimated_traffic:
      row['Monthly Traffic'] ??
      row['estimated_traffic'] ??
      row['Traffic'] ??
      row['Monthly Visitors'] ??
      null,
    source: 'storeleads_seed',
  };

  // Extract social profiles
  // TODO: Adjust column names to match actual Store Leads export
  const socialPlatforms: Array<{ platform: string; columns: string[] }> = [
    {
      platform: 'facebook',
      columns: ['Facebook URL', 'facebook_url', 'Facebook', 'FB URL', 'Facebook Page'],
    },
    {
      platform: 'instagram',
      columns: ['Instagram URL', 'instagram_url', 'Instagram', 'IG URL', 'Instagram Handle'],
    },
    {
      platform: 'tiktok',
      columns: ['TikTok URL', 'tiktok_url', 'TikTok', 'TikTok Handle'],
    },
    {
      platform: 'pinterest',
      columns: ['Pinterest URL', 'pinterest_url', 'Pinterest'],
    },
    {
      platform: 'youtube',
      columns: ['YouTube URL', 'youtube_url', 'YouTube', 'Youtube'],
    },
    {
      platform: 'twitter',
      columns: ['Twitter URL', 'twitter_url', 'Twitter', 'X URL'],
    },
  ];

  const socials: SocialRow[] = [];
  for (const { platform, columns } of socialPlatforms) {
    const url = columns.map((c) => row[c]).find((v) => v && v.trim());
    if (url && url.trim()) {
      // Try to extract handle from URL
      const handle = url.trim().split('/').filter(Boolean).pop() ?? null;
      socials.push({
        platform,
        url: url.trim(),
        handle,
        followers: parseIntOrNull(
          row[`${platform}_followers`] ?? row[`${platform.charAt(0).toUpperCase() + platform.slice(1)} Followers`]
        ),
      });
    }
  }

  return { domain: domainRow, socials };
}

function parseIntOrNull(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? null : n;
}

interface DomainRow {
  domain: string;
  normalized_domain: string;
  root_domain: string;
  company_name: string | null;
  country: string | null;
  category: string | null;
  ecommerce_platform: string | null;
  estimated_revenue: string | null;
  estimated_sales: string | null;
  estimated_traffic: string | null;
  source: string;
}

interface SocialRow {
  platform: string;
  url: string;
  handle: string | null;
  followers: number | null;
}

// ---- Main Import ----
async function main() {
  console.log(`\nGrowth Signals - Store Leads CSV Import`);
  console.log(`File: ${CSV_FILE}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Limit: ${LIMIT === Infinity ? 'unlimited' : LIMIT}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Resume ID: ${RESUME_IMPORT_ID ?? 'none'}\n`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Use direct Postgres for bulk inserts (much faster than Supabase REST for 13M rows)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost')
      ? false
      : { rejectUnauthorized: false },
  });

  if (!fs.existsSync(CSV_FILE!)) {
    console.error(`File not found: ${CSV_FILE}`);
    process.exit(1);
  }

  // Create or resume import record
  let importId = RESUME_IMPORT_ID;
  let processedOffset = 0;

  if (!DRY_RUN) {
    if (importId) {
      const { data: existing } = await supabase
        .from('csv_imports')
        .select('processed_rows, status')
        .eq('id', importId)
        .single();
      if (existing) {
        processedOffset = existing.processed_rows ?? 0;
        console.log(`Resuming import ${importId} from row ${processedOffset}`);
      }
    } else {
      importId = uuidv4();
      await supabase.from('csv_imports').insert({
        id: importId,
        filename: path.basename(CSV_FILE!),
        status: 'running',
        started_at: new Date().toISOString(),
      });
      console.log(`Created import ${importId}`);
    }
  }

  const failedRows: string[] = [];
  let batch: DomainRow[] = [];
  let socialsBatch: Map<string, SocialRow[]> = new Map();
  let totalProcessed = 0;
  let totalFailed = 0;
  let totalInserted = 0;
  let skippedOffset = 0;

  const failedFile = fs.createWriteStream('failed_import_rows.csv', { flags: 'a' });

  async function flushBatch() {
    if (batch.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Bulk upsert domains using unnest for performance
      const domains = batch;

      const result = await client.query(
        `
        INSERT INTO domains (
          domain, normalized_domain, root_domain,
          company_name, country, category,
          ecommerce_platform, estimated_revenue, estimated_sales, estimated_traffic,
          source, first_seen_at, last_seen_at, created_at, updated_at
        )
        SELECT
          unnest($1::text[]),
          unnest($2::text[]),
          unnest($3::text[]),
          unnest($4::text[]),
          unnest($5::text[]),
          unnest($6::text[]),
          unnest($7::text[]),
          unnest($8::text[]),
          unnest($9::text[]),
          unnest($10::text[]),
          unnest($11::text[]),
          NOW(), NOW(), NOW(), NOW()
        ON CONFLICT (domain) DO UPDATE SET
          last_seen_at = NOW(),
          updated_at = NOW(),
          company_name = COALESCE(EXCLUDED.company_name, domains.company_name),
          country = COALESCE(EXCLUDED.country, domains.country),
          category = COALESCE(EXCLUDED.category, domains.category),
          ecommerce_platform = COALESCE(EXCLUDED.ecommerce_platform, domains.ecommerce_platform),
          estimated_revenue = COALESCE(EXCLUDED.estimated_revenue, domains.estimated_revenue),
          estimated_sales = COALESCE(EXCLUDED.estimated_sales, domains.estimated_sales),
          estimated_traffic = COALESCE(EXCLUDED.estimated_traffic, domains.estimated_traffic)
        RETURNING id, domain
        `,
        [
          domains.map((d) => d.domain),
          domains.map((d) => d.normalized_domain),
          domains.map((d) => d.root_domain),
          domains.map((d) => d.company_name),
          domains.map((d) => d.country),
          domains.map((d) => d.category),
          domains.map((d) => d.ecommerce_platform),
          domains.map((d) => d.estimated_revenue),
          domains.map((d) => d.estimated_sales),
          domains.map((d) => d.estimated_traffic),
          domains.map((d) => d.source),
        ]
      );

      // Insert social profiles
      const insertedDomains = result.rows as Array<{ id: number; domain: string }>;
      const domainIdMap = new Map(insertedDomains.map((r) => [r.domain, r.id]));

      for (const [domainStr, socials] of socialsBatch.entries()) {
        const domainId = domainIdMap.get(domainStr);
        if (!domainId || socials.length === 0) continue;

        for (const social of socials) {
          await client
            .query(
              `
              INSERT INTO domain_social_profiles (domain_id, platform, url, handle, followers, created_at)
              VALUES ($1, $2, $3, $4, $5, NOW())
              ON CONFLICT (domain_id, platform) DO UPDATE SET
                url = COALESCE(EXCLUDED.url, domain_social_profiles.url),
                handle = COALESCE(EXCLUDED.handle, domain_social_profiles.handle),
                followers = COALESCE(EXCLUDED.followers, domain_social_profiles.followers)
              `,
              [domainId, social.platform, social.url, social.handle, social.followers]
            )
            .catch(() => {}); // Ignore individual social insert errors
        }
      }

      await client.query('COMMIT');
      totalInserted += domains.length;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Batch insert failed:', err);
      totalFailed += batch.length;
      // Write failed rows
      for (const row of batch) {
        failedRows.push(row.domain);
        failedFile.write(row.domain + '\n');
      }
    } finally {
      client.release();
      batch = [];
      socialsBatch = new Map();
    }
  }

  // Stream the CSV
  const parser = createReadStream(CSV_FILE!).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    })
  );

  for await (const row of parser) {
    if (totalProcessed + skippedOffset >= LIMIT) break;

    // Skip already-processed rows when resuming
    if (skippedOffset < processedOffset) {
      skippedOffset++;
      continue;
    }

    const mapped = mapRow(row as Record<string, string>);
    if (!mapped) {
      totalFailed++;
      continue;
    }

    if (!DRY_RUN) {
      batch.push(mapped.domain);
      if (mapped.socials.length > 0) {
        socialsBatch.set(mapped.domain.domain, mapped.socials);
      }

      if (batch.length >= BATCH_SIZE) {
        await flushBatch();

        // Update progress
        if (!DRY_RUN && importId) {
          await supabase
            .from('csv_imports')
            .update({ processed_rows: totalInserted, failed_rows: totalFailed })
            .eq('id', importId);
        }
      }
    }

    totalProcessed++;

    if (totalProcessed % 10_000 === 0) {
      console.log(
        `Progress: ${totalProcessed.toLocaleString()} rows processed, ${totalInserted.toLocaleString()} inserted, ${totalFailed} failed`
      );
    }
  }

  // Flush remaining
  if (!DRY_RUN) {
    await flushBatch();
  }

  // Finalize import record
  if (!DRY_RUN && importId) {
    await supabase
      .from('csv_imports')
      .update({
        status: 'completed',
        processed_rows: totalInserted,
        failed_rows: totalFailed,
        total_rows: totalProcessed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', importId);
  }

  failedFile.end();
  await pool.end();

  console.log('\n=== Import Complete ===');
  console.log(`Total rows processed: ${totalProcessed.toLocaleString()}`);
  console.log(`Inserted/updated: ${totalInserted.toLocaleString()}`);
  console.log(`Failed: ${totalFailed}`);
  if (DRY_RUN) console.log('(DRY RUN - no data written)');
}

main().catch((err) => {
  console.error('Fatal import error:', err);
  process.exit(1);
});
