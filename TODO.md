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

## Adversarial pass 3 (found + fixed)
- [x] domain_priority table had no RLS while anon key ships in the browser bundle — RLS enabled (no policies; service-role only). ERROR-level advisor cleared.
- [x] get_snapshot_stats(): search_path pinned (advisor WARN).
- [x] Fire-and-forget domain_priority upserts in serverless routes were being frozen
      before completing (priority_domains count was 0 despite views) — now awaited.
- [x] Run #107 (Jul 4) hit the 350-min hard timeout → 'cancelled'; worker now exits
      cleanly at a 335-min soft deadline so in-flight claims aren't stranded.
### Health check (Jul 5 ~05:15 UTC)
- enriched last 24h: 2,515 (healthy); today's 06:00 UTC run not yet fired.
- Snapshots: 59,280 total; 0 brands at zero; trend_ready=21 (expect ~3k after today's run,
  which is the first with the priority pass + seed in place).

## Hardening: serverless writes + RLS + snapshot integrity + observability
**P1 fire-and-forget writes:** full audit — all route writes now awaited; view
tracking extracted to lib/priority.recordPriorityView (awaited, best-effort,
logged, tested: records views, swallows errors, never breaks page load).
Worker job updates awaited.
**P2 RLS posture (manually inspected pg_policy, not just advisors):** all 7
public tables have RLS ENABLED with ZERO policies = default-deny for anon and
authenticated. The browser anon key can only hit Supabase Auth. Every product
read/write goes through Next API routes using the service-role key server-side.
POLICY NOTE: if user-owned data (saved lists per user) moves client-side later,
add owner-scoped policies (user_id = auth.uid()) instead of opening tables.
**P3 snapshot integrity (SQL-verified):** 0 duplicate (domain,snapshot_date)
rows (unique index enforced); 0 seed mismatches — every seed row equals its
signal row's values and last_enriched_at::date; 0 non-'observed' rows.
CAVEAT: seed rows carry derived fields (growth_score) as recomputed post-scrape;
raw ad counts are from the original scrape. run_ids: seed-from-last-enrichment,
gha-<run> (nightly), local-<pid>.
**P4 trend readiness:** get_snapshot_stats() now reports cohort readiness
(top-100 / top-1,000 / viewed); /api/tam returns snapshot_count + trend_status
per row and surfaces trend-ready accounts first; chart labels mixed
seed+observed series.
**P5 observability:** worker writes JSON summary (snapshots_written,
priority_processed, no_ads, partial) into enrichment_jobs.notes; admin shows
last run with Complete/Partial/Did-not-finish badge — partial never shows green.
**Verification gaps (env-blocked):** live worker batch + anon-key probe can't run
from this sandbox (egress allowlist); covered by SQL inspection + unit tests.
Next nightly run (06:00 UTC) is the live verification — check admin panel after.

## INCIDENT: enrichment down Jul 5-8 (fixed)
**Symptom:** 0 successful enrichments after Jul 4 14:36; Jul 8 run failed 100/100.
**Root cause:** Jul 5 change moved the Apify token from URL query to Authorization
header; Apify's run-sync endpoint returned 403 on every call afterwards. REVERTED
to the query-param form that ran ~15k successful scrapes (header kept too).
**Collateral (cleaned):** claim-before-enrich rows with no data accumulated —
45,946 empty claims deleted; 44,445 zero-value seed snapshots (seeded from those
claims) deleted. Real corpus: ~14.8k enriched brands; queue is honest again.
**Guards added:** worker self-heals stranded claims (>2d old, no data) at startup;
circuit breaker aborts the run after 25 consecutive failures with zero successes
(no more burning the whole batch when upstream is down).
**Watch:** if the next run STILL 403s, it's Apify credits/billing — top up at
apify.com (user action).

## P3 adversarial persona pass
Read as: skeptical 3PL rep · agency owner · DTC SaaS AE. Findings + fixes (all copy-level):
- Homepage subhead led with "ad activity, spend estimates" → now "live growth signals — market
  momentum, growth investment, revenue scale, hiring, and tech stack" (CommandHome).
- BUILD_STEPS "Estimating ad spend…" → "Estimating growth investment…" (CommandHome).
- Homepage stat "Est. Annual Ad Spend Tracked" → "Growth Investment Tracked" (CommandHome).
- layout.tsx metadata description rewritten to growth-intelligence framing (no "ad activity").
- Analyze empty state promised "ad-platform activity and a creative-quality breakdown" →
  "the live growth signals behind them" (page.tsx) — an AE read this as ad-spy positioning.
- Top Movers subtitle "accelerating their paid growth" → "accelerating their growth";
  stat "Avg Active Ads / among active advertisers" → "Avg Live Campaigns / among accounts with
  live campaigns"; "Est. Monthly Spend Tracked" → "Growth Investment Tracked"; sort pill
  "Most Meta Ads" → "Most Live Campaigns" (TopMoversView).
- Table column "Meta Ads" → "Live Campaigns" (title tooltip "Active Meta ads observed") and
  "Est. Annual Spend" → "Growth Investment" in TopMoversView + TamListBuilder; TamListBuilder
  filter "Min Meta ads" → "Min live campaigns", sorts "Highest est. spend"/"Most Meta ads" →
  "Highest growth investment"/"Most live campaigns".
- Chart tab "Est. Annual Spend" → "Growth Investment"; refresh pill "Refreshing latest ad
  signals" → "growth signals" (GrowthOverTime). "Active Meta Ads" tab kept (ad-specific series).
- Report: "Est. Paid Media Spend" card → "Est. Growth Investment"; its caption "paid intensity"
  → "growth investment intensity"; Growth Narrative footer "tracked ad and growth signals" →
  "live growth signals" (page.tsx). "Paid Media Overview"/"Paid Media Quality" cards and
  benchmark platform rows kept — clearly ad-specific evidence UI.
- Extension popup: brief/insight lines "paid-media scaling", "paid channels", "paid investment",
  "multi-channel advertiser", "Limited paid signal" → growth-investment phrasing; spend row
  "Est. Annual Ad Spend" → "Est. Growth Investment". Meta/Google/LinkedIn Ads stat labels kept
  (extension is the evidence surface).
Kept deliberately: suggested-query chips ("Brands scaling Meta ads", "spending $100k+/mo") — they
are user queries, not product framing; admin/bulk copy (operational); tamQuery parser keywords,
API field names, lib outbound/lens copy untouched.
Edge cases verified: zero-ad report → hero still score/momentum-first, signals grid Paid Media
intensity renders "None" (lib/signals intensityLabel fallback); persona 'other' → no lens chip in
TAM results; empty My Accounts → growth-framed empty state ("Monitor your book of business").

## Repositioning run summary
- P0: score-first report hierarchy (Growth Score/Rank hero, momentum, revenue, growth
  investment metric row), growth-intelligence nav/framing.
- P1: signal registry (lib/signals.ts) + Growth Signals grid with honest live/coming-soon
  status; persona lens (localStorage, templated persona takeaways/angles, no extra LLM calls).
- P2: My Accounts (watchlist-backed + /api/accounts scoring), alerts computed from snapshot
  deltas, CRM push UI stub, "Growth Investment" naming for the spend-estimate surface.
- P3: full ad-tool copy sweep (app + extension + metadata), adversarial persona pass (above),
  wrap-up docs.
Deferred: real CRM OAuth (connected-app setup per provider, token store, field mapping);
real hiring / tech-stack / funding signal sources (grid slots exist as coming-soon);
server-side persona storage when workspaces exist.

## Hiring signals (Phase 1: public ATS APIs) — SHIPPED
- lib/providers/jobs.ts: resolves a brand's job board via homepage/careers-page
  ATS link detection (Greenhouse/Lever/Ashby/Recruitee) with domain-stem probe
  fallback; fetches the PUBLIC board JSON (no scraping, no tokens); classifies
  growth/marketing vs ops/fulfillment roles.
- Runs in parallel with the Meta scrape inside enrich-meta (best-effort, own
  timeouts, never fails an enrichment). Persists ats_provider/slug, open_roles,
  growth_roles, ops_roles, jobs_checked_at; snapshots carry open_roles so
  hiring velocity becomes a time series like ads.
- Hiring Velocity card goes LIVE per brand once checked: open roles + growth/
  ops splits + source; brands with no public board show an honest
  "checked, none found" state. Fills in as the nightly worker re-enriches.
- Deferred (Phase 2, documented): LinkedIn/Indeed via Apify for non-ATS brands
  (~$1-5/1k listings, top-tier only); paid datasets (Coresignal etc.) later.
- NOTE: live-network verification impossible from this sandbox (egress
  allowlist); resolution/classification covered by unit tests; first real
  coverage numbers visible after tonight's run (query: count jobs_checked_at
  IS NOT NULL / ats_provider IS NOT NULL).
