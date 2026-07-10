# Tambourine Repositioning Plan — score first, signals second, persona-aware

## File map (verified against codebase)
- Company page/report: app/page.tsx (report view ~L1900-2100 metric strip, narrative), app/components/GrowthOverTime.tsx (chart tabs), app/components/MetricCard.tsx
- Top Movers: app/components/TopMoversView.tsx (reason column via lib/reason)
- Homepage: app/components/CommandHome.tsx (subhead, chips)
- TAM: app/components/TamListBuilder.tsx, app/api/tam/route.ts (reason/outbound per row)
- Settings view: app/page.tsx SettingsView
- Watchlist ("My Accounts" base): app/api/watchlist/route.ts, watchlist view in page.tsx
- Imports: page.tsx Imports view + /api/import-master
- Narrative: /api/analyze-domain (LLM, prompt server-side) + researchBrief.ts (templated)
- Reason/copy: lib/reason.ts

## Build order
P0 foundation (me): lib/persona.ts (Persona type + storage + persona reason/takeaway templates),
lib/signals.ts (pluggable signal-category model: paid_media live; hiring/tech_stack/product_sku/
funding/reviews_traffic coming-soon), tests. PLAN/DECISIONS files.
P0 agent: hero reorder (Score → Momentum → Est. Revenue → Growth Investment → Signals summary),
demote Meta ads + intensity into new GrowthSignalsGrid below chart; rename Paid Media Intensity →
Growth Investment Intensity app-wide; chart default tab growth_score; persona-aware narrative block
with lens switcher; keep Copy button.
P1 agent: Settings "What do you sell?" (Agency/DTC SaaS/3PL/Other, localStorage per user, default
other); persona plumbed into Top Movers + TAM reason cells (client-side re-template from row
signals); persona indicator near narrative.
P2 agent: MyAccountsView (CSV/paste import → /api/accounts scoring endpoint → sortable book-of-
business table w/ persona reasons; unknown domains enqueued via domain_priority + master upsert);
alerts derived from snapshot deltas (entered Exploding / score +10 / entered top 1%) for account
domains; homepage second entry point card; Push-to-CRM stub (lib/crm.ts interface + disabled UI).
P3 agent: ad-tool language sweep (ad copy stays only inside Paid Media signal card), homepage
subhead rewrite, persona chips; adversarial read-through as 3PL rep / agency owner / SaaS AE.

## Regression gates after each P-level
tsc, npm test, next build + spot-check flows: TAM query, search/report, watchlist add, extension API shapes.
