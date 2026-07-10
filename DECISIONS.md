# Decisions log — repositioning run

1. Persona storage: localStorage keyed `${userId}:tam_persona` (workspace tables don't exist;
   consistent with quota storage). Server APIs accept persona as a request param where needed —
   no schema change. Default 'other'.
2. Persona narrative: templated (lib/persona.ts), NOT extra LLM calls — deterministic, free,
   instant, testable. The existing LLM narrative stays as the base "Summary"; persona layer
   reframes takeaways/why-interesting from structured signals.
3. Signal categories: single registry in lib/signals.ts; each category = {key, label, status:
   'live'|'coming_soon', metrics[], blurb}. New sources plug in by adding a builder — no page rework.
4. "Growth Investment" = the renamed spend estimate surface; "Growth Investment Intensity" = renamed
   ad_activity_level label. DB columns unchanged (rename is presentation-level only).
5. My Accounts is watchlist-backed (list_name 'My Accounts') + new /api/accounts scoring endpoint —
   reuses existing tables, no migration.
6. Alerts: computed on read from domain_snapshots deltas (last 2 snapshots) — no queue/notification
   infra this run; wired to My Accounts + watchlist domains.
7. CRM push: UI + lib/crm.ts interface only (coming soon). Real OAuth per provider documented in TODO.
8. No new npm dependencies.
9. P3 copy sweep: "Live Campaigns" is the user-facing name for the active-Meta-ads count in
   list/table surfaces (tooltip "Active Meta ads observed" preserves precision); raw "Meta Ads"
   labels remain only in clearly ad-specific evidence UI (chart tab, benchmark platform rows,
   Paid Media cards, extension stats grid).
10. Suggested-query chips on the home screen keep ad wording ("Brands scaling Meta ads", "high
   ad spend") — they are example *queries* fed to the TAM parser, not product positioning, and
   rewording risks breaking parser extraction.
11. "Est. Paid Media Spend" report card retitled "Est. Growth Investment" to match the metric-row
   and signals-grid naming; methodology caption still cites live ad volume (honest sourcing).
12. layout.tsx metadata mirrors the homepage subhead's growth-signals framing ("expansion
   activity" instead of enumerating hiring/tech-stack, which are still coming-soon).
