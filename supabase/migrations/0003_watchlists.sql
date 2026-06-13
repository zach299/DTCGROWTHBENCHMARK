-- Phase 4: watchlists. Single-user tool, no auth — one row per (domain, list).
create table if not exists public.watchlist_items (
  id bigint generated always as identity primary key,
  domain text not null,
  brand_name text,
  list_name text not null default 'Prospects',
  added_at timestamptz not null default now(),
  unique (domain, list_name)
);

create index if not exists watchlist_items_list_idx
  on public.watchlist_items (list_name, added_at desc);
