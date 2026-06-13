-- Phase 6: Meta-only intelligence dataset (built by the bulk enrichment script).
create table if not exists public.company_meta_signals (
  id bigint generated always as identity primary key,
  domain text not null unique,
  company_name text,
  active_meta_ads integer,
  creative_count integer,
  creative_velocity text,
  campaign_diversity text,
  landing_pages jsonb,
  campaign_themes jsonb,
  sample_ad_copy jsonb,
  ad_activity_level text,
  first_seen_date timestamptz,
  last_seen_date timestamptz,
  raw_meta_response jsonb,
  last_enriched_at timestamptz not null default now()
);

create index if not exists company_meta_signals_enriched_idx
  on public.company_meta_signals (last_enriched_at desc);
create index if not exists company_meta_signals_ads_idx
  on public.company_meta_signals (active_meta_ads desc);
