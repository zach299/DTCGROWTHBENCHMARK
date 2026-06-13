# Growth Signals (MVP)

Simple Next.js app that scores DTC brands from an existing Supabase database
(`master_database` + `domain_analyses` tables).

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional, for future client usage)
- `APIFY_TOKEN` (Phase 2: Meta Ad Library enrichment; if missing, analysis falls back to heuristics)
- `APIFY_META_ADS_ACTOR_ID` (optional, defaults to `curious_coder~facebook-ads-library-scraper`)

## API

### POST /api/analyze-domain

```json
{ "domain": "ridge.com" }
```

- Looks up the domain in `master_database` (404 if not found).
- Returns a cached analysis from `domain_analyses` if one exists (`"cached": true`).
- Otherwise computes a score, stores it, and returns it.

Response includes `growth_score`, `northbeam_fit_score`, `paid_media_signal`,
`recommended_buyer`, `recommended_angle`, `outbound_hook`, `reasons`,
`meta_ads` (active ads count, activity level, landing pages, sample copy and
creatives, platforms — `null` when no ad data is available), and the
`company` row. Cached responses also surface `meta_ads` from the stored
`raw_response`.

## Scoring (Phase 2)

On a cache miss, if the company has a `facebook_url` and `APIFY_TOKEN` is set,
the route fetches Meta Ad Library signals via Apify (sync run, ~2 min max) and
computes deterministic Growth and Northbeam Fit scores from active ad volume,
unique landing pages, estimated yearly sales, followers, Shopify usage, and
social channel presence. If the Apify call fails or is not configured, scoring
falls back to a conservative heuristic (no ad/landing-page points) and a
"Meta Ad Library data unavailable" reason is included.

Default actor: `curious_coder~facebook-ads-library-scraper`. The actor's input
and dataset field names are mapped defensively in
`lib/providers/apifyMetaAds.ts` and may need adjusting if you swap actors or
the actor's output schema changes.

## Next steps

- Replace deterministic scoring with Claude-generated analysis.
- Add site-level signals (tech stack, landing page scraping).
