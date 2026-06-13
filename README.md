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

## API

### POST /api/analyze-domain

```json
{ "domain": "ridge.com" }
```

- Looks up the domain in `master_database` (404 if not found).
- Returns a cached analysis from `domain_analyses` if one exists (`"cached": true`).
- Otherwise computes a score, stores it, and returns it.

Response includes `growth_score`, `northbeam_fit_score`, `paid_media_signal`,
`recommended_buyer`, `recommended_angle`, `outbound_hook`, `reasons`, and the
`company` row.

## Note on scoring

Scoring is currently a **deterministic placeholder heuristic** based on
followers, estimated sales, social channel presence, and platform. No external
enrichment or LLM calls yet.

## Next steps

- Replace placeholder scoring with Claude-generated analysis.
- Add Apify-based enrichment (Meta ads, site signals).
