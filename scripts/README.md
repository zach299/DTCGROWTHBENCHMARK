# Bulk Meta Enrichment (Phase 6)

Builds the Meta-only intelligence dataset across the top Shopify stores.
**Meta only** — no Google, LinkedIn, website crawl, research brief, or AI.

## Prerequisites

1. Run the migrations (`supabase/migrations/0004_*` and `0005_*`).
2. `.env.local` must contain `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (the script reads them directly).
3. `npm install` at the repo root (uses `@supabase/supabase-js`).

## Run

```bash
# Test small first (e.g. 25 domains) to validate cost + quality:
node scripts/bulk-enrich.mjs 25

# Then the full first batch (hard stop 1000):
node scripts/bulk-enrich.mjs
```

It will:
- Pull the top Shopify stores by sales from the source table
- Skip any company enriched in the last 30 days
- Enrich with **Meta only** at concurrency 3, batches of 100, 2 retries
- Write to `company_meta_signals`, track the run in `enrichment_jobs`
- **Hard stop at 1,000** and print a completion report (spend, success rate,
  avg ads, avg landing pages). It does NOT auto-continue.

## Config (env overrides)

| Var | Default | Notes |
|---|---|---|
| `SOURCE_TABLE` | `master_database` | Set to `master_companies` if that's your table |
| `SALES_COLUMN` | `estimated_yearly_sales` | Use `estimated_sales` for `master_companies` |
| `PLATFORM` | `shopify` | Platform filter |
| `GROWTH_SIGNALS_API_BASE` | production URL | Where `/api/enrich-meta` lives |
| `HARD_STOP` | `1000` | Or pass as the first CLI arg |
| `BATCH_SIZE` | `100` | |
| `CONCURRENCY` | `3` | |
| `RETRIES` | `2` | |
| `SKIP_DAYS` | `30` | Skip companies enriched within N days |
| `COST_PER_DOMAIN` | `0.1` | For the spend estimate |

> Note on ordering: if your sales column is **text** (e.g. "USD $127M"), the
> script fetches a buffer and re-sorts numerically. If it's numeric, ordering is
> exact. Point `SOURCE_TABLE`/`SALES_COLUMN` at whichever table you're using.

Progress is visible in the dashboard under **Bulk Enrichment**.
