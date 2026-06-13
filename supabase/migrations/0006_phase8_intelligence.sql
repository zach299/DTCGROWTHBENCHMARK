-- Phase 8: richer intelligence on the enriched dataset.
-- Adds normalized category, multi-channel ad counts, derived scores, modeled
-- revenue, spend band and a provenance source to company_meta_signals; and a
-- source column on master_database for organically-added (extension) companies.

alter table public.company_meta_signals
  add column if not exists primary_category text,
  add column if not exists subcategory text,
  add column if not exists category_confidence text,
  add column if not exists google_ads integer default 0,
  add column if not exists linkedin_ads integer default 0,
  add column if not exists growth_score integer,
  add column if not exists growth_momentum text,
  add column if not exists estimated_revenue_range text,
  add column if not exists revenue_confidence text,
  add column if not exists spend_band text,
  add column if not exists followers bigint,
  add column if not exists source text default 'bulk';

create index if not exists company_meta_signals_category_idx
  on public.company_meta_signals (primary_category);
create index if not exists company_meta_signals_score_idx
  on public.company_meta_signals (growth_score desc);

-- Organically-added companies (e.g. from the Chrome extension) need provenance.
alter table public.master_database
  add column if not exists source text default 'store_leads';

-- sales_numeric + indexes for fast "top stores" ordering at scale (idempotent;
-- safe if already created manually).
alter table public.master_database
  add column if not exists sales_numeric numeric
  generated always as (
    nullif(regexp_replace(coalesce(estimated_yearly_sales, ''), '[^0-9.]', '', 'g'), '')::numeric
  ) stored;
create index if not exists idx_master_sales_numeric
  on public.master_database (sales_numeric desc nulls last);
create index if not exists idx_master_platform_sales
  on public.master_database (platform, sales_numeric desc nulls last);
