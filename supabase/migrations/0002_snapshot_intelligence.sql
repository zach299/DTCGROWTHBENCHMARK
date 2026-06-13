-- Phase 4: extend daily snapshots with the new intelligence fields so the
-- timeline + top-movers can read Google/LinkedIn activity, momentum, and ranges.
alter table public.domain_snapshots
  add column if not exists active_google_ads integer,
  add column if not exists active_linkedin_ads integer,
  add column if not exists growth_momentum text,
  add column if not exists revenue_range text;
