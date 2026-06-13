-- Historical growth snapshots: one immutable row per domain per day.
-- Powers trend intelligence that compounds over time.
create table if not exists public.domain_snapshots (
  id bigint generated always as identity primary key,
  domain text not null,
  snapshot_date date not null default current_date,
  active_meta_ads integer,
  landing_pages_count integer,
  estimated_revenue numeric,
  growth_score integer,
  northbeam_fit integer,
  paid_media_intensity text,
  creative_velocity text,
  campaign_diversity text,
  raw_meta_data jsonb,
  created_at timestamptz not null default now(),
  -- enforce one snapshot per domain per day; historical rows never overwritten
  unique (domain, snapshot_date)
);

create index if not exists domain_snapshots_domain_date_idx
  on public.domain_snapshots (domain, snapshot_date desc);
