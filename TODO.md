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

## Deployment — read this before debugging "site is down"
**Vercel's Production branch is `claude/lucid-babbage-u29ovt`, NOT `main`.**
Every push goes to BOTH branches (`git push origin main main:claude/lucid-babbage-u29ovt`).
The deploy hook (`.../WbvqNGRy9v`) targets `main` and therefore creates PREVIEW
deployments only — do not rely on it for production.

### Deployment checklist
1. Push to both branches (the standard push command above does this).
2. Vercel → Deployments: confirm the new deployment shows **Production** (not Preview) and **Ready**.
3. `curl -sSI https://dtcgrowthbenchmark.vercel.app` → expect HTTP 200.
4. If 401/403: Settings → Deployment Protection → Vercel Authentication must be **off** (and SAVED).
5. Env vars required in Production: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
   APIFY_TOKEN, ANTHROPIC_API_KEY, and (for login) NEXT_PUBLIC_SUPABASE_ANON_KEY.
   Missing anon key = app runs with auth disabled by design (no crash).
6. After env var changes, redeploy — env is baked at build time for NEXT_PUBLIC_*.

## Auth hardening (verified)
- [x] Missing NEXT_PUBLIC_* env vars: client returns null, authEnabled=false, app renders without login (tests/authClient.test.mts)
- [x] Production build passes locally with and without auth env (build inlines whatever is present; runtime guards cover both)

## Brand-detail trend investigation (priority shift)
**Found:**
- domain_snapshots IS canonically keyed (0 www/protocol variants in table); ruggable.com resolves correctly.
- ruggable.com has exactly 1 snapshot — "Tracking started" was honest data, not a lookup bug.
  History only started compounding when bulk enrichment began writing snapshots (Jul 4).
- REAL client bug: phase-2 enrichment refresh replaces report state and can clobber the
  history the page already had → the flicker/"refresh changes the state" behavior.
- Cadence: SKIP_DAYS=30 → bulk adds only ~1 snapshot/brand/month. Extension/UI views
  refresh viewed brands every 7d, so brands people look at accumulate history 4x faster.
  DECISION: keep 30d bulk cadence for cost (weekly 50k ≈ ~$2k/mo Apify); revisit with a
  priority tier (top 5k weekly) if trend depth matters sooner.
**Verified:** 40 tests green incl. new domain-canonicalization + trends-window suites.
**Next (commit 2):** client hydration — canonical history fetched on report load, kept in
separate state, never replaced by pending enrichment; specific loading copy; chart module polish.

## Priority-shift verification (trend fix + polish)
- [x] Commit 2: brand-detail history hydration — dedicated never-shrinking state slot,
      canonical /api/company fetch on every load, phase-2 can't clobber the chart,
      specific loading copy, 3-tab full-width chart with last-updated + snapshot count.
- [x] Commit 3: screenshot polish — Top Movers max-width/density/divider artifact
      (light-mode divide-gray-100 was the "broken white line"), clickable rows w/ hover
      chevron, grouped filter toolbar, spend-explanation tooltips; brand-detail metric
      strip normalized, narrative overflow fixed; home hero rhythm, prompt focus glow,
      preview-row parity, card tile consistency.
- Verified each: tsc 0 errors, 43/43 tests, production build green.
- Manual browser click-through (ruggable.com from Top Movers etc.) still needs a human
  pass — automated layers (API shape, state flow, build) are covered by tests.

## Observed-trend acceleration (priority correction — no synthetic history)
**Cadence (documented):** GitHub Actions "Enrich Top 50k Brands", daily 06:00 UTC,
up to 3,000 domains/run at concurrency 6; each domain refreshed when stale >30d.
NEW: priority pass runs first each night — viewed/searched brands (domain_priority
table, recorded by /api/company + extension lookup) and the current top-100 movers
refresh on a 24h cadence (up to 300/run).
**Snapshot writing:** every enrichment writes an immutable snapshot deduped by
(domain, snapshot_date) UNIQUE index — value changes never skip a write; races safe
via ignoreDuplicates. Snapshots now carry spend_low/mid/high, spend_confidence,
run_id (gha-<run>), source='observed'.
**Seed:** one-time SQL seeded a snapshot per enriched brand from its last-enrichment
date (real observed values, source='observed', run_id='seed-from-last-enrichment').
Result: 59,280 snapshots, 0 brands at zero, next daily run makes top brands 2-point
trend_ready.
**trend_status:** helper in lib/trends.ts (not_started / tracking_started /
trend_ready), returned by /api/company and /api/extension/lookup.
**Admin:** /api/worker/stats now returns snapshot distribution (0/1/2+/7+ via
get_snapshot_stats()), last run row from enrichment_jobs, and the cadence string.
**Verify after tonight's run:** brands_trend_ready should jump from 21 to ~3,000;
click ruggable/fleet feet → real 2-point line, no refresh needed.
