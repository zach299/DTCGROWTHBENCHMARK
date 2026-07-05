# Tambourine — Hardening Checklist

Running log for the autonomous hardening pass. Priority: crashes/bugs > data
correctness > UX polish > code quality. Every item is verified by running
code (tests / tsc / build) before being checked off.

## P0 — Crashes / bugs
- [x] Auth crash when NEXT_PUBLIC_SUPABASE_ANON_KEY missing (app dies on load) — fixed: null-safe client, authEnabled degrade (e068343)
- [x] Ad-spend model produces absurd bands for catalog advertisers — rebuilt with diminishing returns + revenue anchor + tests (a947f6f)
- [ ] `/api/search`: PostgREST filter injection — user text interpolated into .ilike() unescaped (`%`, `_`, `,`, `(`, `)` break the filter grammar / enable wildcard scans)
- [ ] `/api/worker/stats`: no try/catch — any of 7 parallel queries rejecting returns an unhandled 500
- [ ] `/api/bulk-job` + `/api/bulk-targets`: zod .parse() outside try — invalid input yields 500 instead of 400

## P1 — Data correctness / security
- [ ] Apify token passed in URL query string (leaks into proxy/CDN logs) — move to Authorization header
- [ ] `/api/rank` loads the entire enriched table on every request with no cache (unlike /api/benchmarks' 5-min cache) — cheap DoS, slow extension rank fetch
- [ ] enrich-meta returns HTTP 200 on hard failure (ok:false) — intentional for the bulk loop but defeats monitoring; document or add ?strict=1
- [ ] Cached /api/analyze-domain hits still call writeSnapshot (dedupes per-day, so acceptable; revisit if hot domains cause write load)

## P2 — UX polish
- [ ] Verify chart metric toggles hide when a series has no data (visual pass once more history accumulates)
- [ ] Extension: confirm outbound-angle button hidden for domains with no signals
- [ ] Homepage stat cards derive from top-300 ranked set, not full universe — consider a /api/stats endpoint

## P3 — Code quality
- [ ] No tests for lib/tamQuery.ts (NL parser) and lib/reason.ts — add node:test coverage
- [ ] app/page.tsx still ~2,400 lines — further view extraction
- [ ] maxDuration=300 on three routes exceeds Hobby-plan 60s cap — harmless on Pro; note only

## Decisions log
- Free-tier gating stays localStorage/per-user (no server enforcement until auth is mandatory).
- `/api/worker/stats` stays unauthenticated (feeds public /admin page); wrapped in try/catch instead.
- No new npm dependencies introduced; tests run on node:test with --experimental-strip-types.
