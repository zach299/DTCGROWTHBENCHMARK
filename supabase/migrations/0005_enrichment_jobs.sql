-- Phase 6: track each bulk enrichment run.
create table if not exists public.enrichment_jobs (
  job_id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  domains_processed integer not null default 0,
  domains_successful integer not null default 0,
  domains_failed integer not null default 0,
  estimated_cost numeric not null default 0,
  notes text
);
