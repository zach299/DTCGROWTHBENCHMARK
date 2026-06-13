# Growth Signals API

Ecommerce brand GTM intelligence platform. Given a domain, returns a Growth Score and outbound messaging recommendations based on real signals.

## Architecture

- **Next.js** on Vercel — API routes + minimal web UI
- **Supabase Postgres** — domain database, enrichment data, scores
- **Apify** — Meta Ads Library scraping
- **Anthropic Claude** — growth score generation and GTM recommendations
- **Direct Postgres** — high-throughput CSV import (13M+ rows)

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd DTCGROWTHBENCHMARK
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in all values:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `DATABASE_URL` | Direct Postgres connection string (for CSV import) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `APIFY_TOKEN` | Apify API token |
| `APIFY_META_ADS_ACTOR_ID` | Apify actor ID for Meta Ads Library |
| `CRON_SECRET` | Secret for cron route protection |

### 3. Database migration

Run the migration in Supabase SQL editor or via psql:

```bash
npm run db:migrate
```

Or paste `supabase/migrations/001_initial_schema.sql` into the Supabase SQL editor.

### 4. Create an API key

```bash
npm run create-api-key -- --account-name "My Account"
```

This prints a `gsa_...` key. Store it securely.

### 5. Import Store Leads CSV

```bash
# Dry run first
npm run import:storeleads -- --file /path/to/storeleads.csv --dry-run

# Full import (streams in batches of 2000)
npm run import:storeleads -- --file /path/to/storeleads.csv --batch-size 2000

# Resume a failed import
npm run import:storeleads -- --file /path/to/storeleads.csv --resume-import-id <uuid>
```

The import:
- Streams the CSV (never loads it all into memory)
- Deduplicates by domain
- Upserts in batches via direct Postgres connection
- Writes failed rows to `failed_import_rows.csv`
- Tracks progress in `csv_imports` table

### 6. Run locally

```bash
npm run dev
```

## API Reference

All API routes require `x-api-key: gsa_...` header.

### POST /api/v1/analyze-domain

```bash
curl -X POST https://yourdomain.com/api/v1/analyze-domain \
  -H "x-api-key: gsa_..." \
  -H "Content-Type: application/json" \
  -d '{"domain": "ridge.com"}'
```

### POST /api/v1/bulk-analyze

```bash
curl -X POST https://yourdomain.com/api/v1/bulk-analyze \
  -H "x-api-key: gsa_..." \
  -H "Content-Type: application/json" \
  -d '{"domains": ["ridge.com", "hexclad.com"]}'
```

### GET /api/v1/domain/:domain

```bash
curl https://yourdomain.com/api/v1/domain/ridge.com \
  -H "x-api-key: gsa_..."
```

### POST /api/v1/enqueue

```bash
curl -X POST https://yourdomain.com/api/v1/enqueue \
  -H "x-api-key: gsa_..." \
  -H "Content-Type: application/json" \
  -d '{"domain": "ridge.com", "job_types": ["site", "hiring", "meta_ads", "score"]}'
```

## Enrichment Workers

### Run manually

```bash
npm run worker:jobs
```

### Job types

| Type | Description |
|---|---|
| `site` | Fetches homepage, extracts tech signals |
| `hiring` | Checks careers pages, counts growth roles |
| `meta_ads` | Queries Apify for Meta Ads Library data |
| `score` | Calls Claude to generate growth score |

## Vercel Deployment

Deploy normally. Cron jobs are defined in `vercel.json`:
- Every hour: process enrichment jobs
- Daily at 2am: enqueue stale high-score domains for refresh

Set all env vars in Vercel dashboard.

## TODO / Known Gaps

- **Apify actor field mapping**: `lib/providers/apifyMetaAds.ts` has TODO comments where actor-specific response fields need mapping. Update after testing with your chosen actor.
- **Rate limiting**: `last_used_at` is tracked but no hard rate limit enforced. Add Redis-based rate limiting for production.
- **Store Leads column names**: `scripts/import-storeleads-csv.ts` tries common variants but may need adjustment for your specific export format.
- **Webhook authentication**: Apify webhook route does not validate signatures. Add HMAC verification for production.
- **Admin auth**: Admin pages are unprotected. Add auth before exposing publicly.
