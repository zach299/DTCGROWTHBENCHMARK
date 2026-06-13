// Stream a large Store Leads CSV into master_database in batches.
// Runs locally where the CSV lives — bypasses the flaky dashboard importer.
//
// Usage:
//   node --env-file=.env.local scripts/import-master.mjs /path/to/top100k.csv
//
// - Streams the file (handles 100k or 14M rows without loading it into memory).
// - Upserts on `domain`, so it NEVER crashes on duplicate keys (no truncate needed).
// - Only maps columns that exist in master_database; ignores extras in the CSV.

import { createReadStream } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node --env-file=.env.local scripts/import-master.mjs <csv-path>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local)');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Columns master_database actually has. Anything else in the CSV is dropped.
const ALLOWED = new Set([
  'domain', 'average_product_price', 'categories', 'combined_followers',
  'company_location', 'estimated_yearly_sales', 'facebook_url',
  'instagram_url', 'platform', 'tiktok_url',
]);

const BATCH = 500;

// Minimal RFC-4180 streaming CSV parser: handles quoted fields, escaped quotes
// ("") and commas/newlines inside quotes.
function makeParser(onRow) {
  let field = '';
  let row = [];
  let inQuotes = false;
  let prevQuote = false;
  return {
    push(chunk) {
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (inQuotes) {
          if (c === '"') { prevQuote = true; inQuotes = false; }
          else field += c;
        } else if (prevQuote && c === '"') {
          field += '"'; inQuotes = true; prevQuote = false; // escaped quote
        } else {
          prevQuote = false;
          if (c === '"') inQuotes = true;
          else if (c === ',') { row.push(field); field = ''; }
          else if (c === '\n') { row.push(field); onRow(row); row = []; field = ''; }
          else if (c === '\r') { /* skip */ }
          else field += c;
        }
      }
    },
    end() {
      if (field.length || row.length) { row.push(field); onRow(row); }
    },
  };
}

let header = null;
let colIndex = []; // [{ name, idx }] for allowed columns present in the CSV
let batch = [];
let total = 0;
let upserted = 0;
let skipped = 0;
let inflight = Promise.resolve();

async function flush(rows) {
  if (!rows.length) return;
  const { error } = await supabase
    .from('master_database')
    .upsert(rows, { onConflict: 'domain', ignoreDuplicates: false });
  if (error) {
    console.error(`\nBatch failed (${rows.length} rows): ${error.message}`);
    // Don't abort the whole import on one bad batch.
  } else {
    upserted += rows.length;
  }
  process.stdout.write(`\rprocessed ${total}  upserted ${upserted}  skipped ${skipped}`);
}

function handleRow(cells) {
  if (!header) {
    header = cells.map((h) => h.trim().toLowerCase());
    colIndex = header
      .map((name, idx) => ({ name, idx }))
      .filter((c) => ALLOWED.has(c.name));
    if (!colIndex.some((c) => c.name === 'domain')) {
      console.error('CSV has no "domain" column. Header was:', header.join(', '));
      process.exit(1);
    }
    console.log('Mapping columns:', colIndex.map((c) => c.name).join(', '));
    return;
  }
  total++;
  const rec = {};
  for (const { name, idx } of colIndex) {
    const v = (cells[idx] ?? '').trim();
    rec[name] = v === '' ? null : v;
  }
  if (!rec.domain) { skipped++; return; }
  batch.push(rec);
  if (batch.length >= BATCH) {
    const rows = batch;
    batch = [];
    inflight = inflight.then(() => flush(rows));
  }
}

const parser = makeParser(handleRow);
const stream = createReadStream(file, { encoding: 'utf8' });

stream.on('data', (chunk) => parser.push(chunk));
stream.on('end', async () => {
  parser.end();
  await inflight;
  await flush(batch);
  console.log(`\n\nDone. ${total} rows read, ${upserted} upserted, ${skipped} skipped (no domain).`);
});
stream.on('error', (err) => {
  console.error('Read error:', err.message);
  process.exit(1);
});
