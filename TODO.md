# Tambourine — Hardening Checklist

Running log for the autonomous hardening pass. Priority: crashes/bugs > data
correctness > UX polish > code quality. Every item is verified by running
code (tests / tsc / build) before being checked off.

## P0 — Crashes / bugs
- [x] Auth crash when NEXT_PUBLIC_SUPABASE_ANON_KEY missing (app dies on load) — fixed: null-safe client, authEnabled degrade (e068343)
- [x] Ad-spend model produces absurd bands for catalog advertisers — rebuilt with diminishing returns + revenue anchor + tests (a947f6f)
- [x] `/api/search`: PostgREST filter injection — escaped + length-capped (254c660) — user text interpolated into .ilike() unescaped (`%`, `_`, `,`, `(`, `)` break the filter grammar / enable wildcard scans)
- [x] `/api/worker/stats`: no try/catch — wrapped, clean 500 JSON — any of 7 parallel queries rejecting returns an unhandled 500
- [x] `/api/bulk-job` + `/api/bulk-targets`: safeParse -> 400 — invalid input yields 500 instead of 400

## P1 — Data correctness / security
- [x] Apify token passed in URL — moved to Authorization header query string (leaks into proxy/CDN logs) — move to Authorization header
- [x] `/api/rank` — now reuses 5-min cached rowset shared with /api/benchmarks on every request with no cache (unlike /api/benchmarks' 5-min cache) — cheap DoS, slow extension rank fetch
- [x] enrich-meta hard failures now return 502 (body keeps ok:false shape; all callers verified)
- [ ] Cached /api/analyze-domain hits still call writeSnapshot (dedupes per-day, so acceptable; revisit if hot domains cause write load)

## P2 — UX polish
- [ ] Verify chart metric toggles hide when a series has no data (visual pass once more history accumulates)
- [x] Extension outbound-angle button verified hidden when angle is null (popup.js:408)
- [x] Homepage stat cards — new /api/stats full-universe endpoint (5-min cache), CommandHome prefers it with movers fallback

## P3 — Code quality
- [x] Tests for lib/tamQuery.ts + lib/reason.ts (17 total tests green)
- [ ] app/page.tsx still ~2,400 lines — further view extraction
- [ ] maxDuration=300 on three routes exceeds Hobby-plan 60s cap — harmless on Pro; note only

## Decisions log
- Free-tier gating stays localStorage/per-user (no server enforcement until auth is mandatory).
- `/api/worker/stats` stays unauthenticated (feeds public /admin page); wrapped in try/catch instead.
- No new npm dependencies introduced; tests run on node:test with --experimental-strip-types.

## Adversarial pass 2 (found + fixed)
- [x] Public /api/extension/lookup inserted arbitrary strings into master_database — hostname regex gate added (400 on junk)
- [x] Admin "Trigger Worker Now" button broke when worker went fail-closed — replaced with GitHub Actions pointer
- [ ] tests for lib/creativeQuality.ts (DPA detection) — next pass
- [ ] TamListBuilder: verify CSV export escapes quotes/commas in reason text — next pass
