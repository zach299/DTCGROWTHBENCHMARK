-- Phase 8 (sprint): Paid Media Quality model. Distinguishes genuine campaign
-- creative from catalog/DPA/product-feed volume so ranking rewards real testing
-- motion, not raw ad count.
alter table public.company_meta_signals
  add column if not exists unique_creative_count integer,
  add column if not exists creative_diversity_score integer,
  add column if not exists campaign_angle_count integer,
  add column if not exists offer_diversity integer,
  add column if not exists landing_page_diversity integer,
  add column if not exists dpa_share numeric,
  add column if not exists real_creative_score integer,
  add column if not exists quality_adjusted_ads integer;

create index if not exists company_meta_signals_real_creative_idx
  on public.company_meta_signals (real_creative_score desc);
