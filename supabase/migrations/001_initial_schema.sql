-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- accounts
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- api_keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  key_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- domains
CREATE TABLE IF NOT EXISTS domains (
  id BIGSERIAL PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  root_domain TEXT,
  normalized_domain TEXT,
  company_name TEXT,
  country TEXT,
  category TEXT,
  ecommerce_platform TEXT,
  estimated_revenue TEXT,
  estimated_sales TEXT,
  estimated_traffic TEXT,
  source TEXT DEFAULT 'storeleads_seed',
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- domain_social_profiles
CREATE TABLE IF NOT EXISTS domain_social_profiles (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT REFERENCES domains(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT,
  url TEXT,
  followers BIGINT,
  followers_30d BIGINT,
  followers_90d BIGINT,
  posts BIGINT,
  raw JSONB,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(domain_id, platform)
);

-- ad_accounts
CREATE TABLE IF NOT EXISTS ad_accounts (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT REFERENCES domains(id) ON DELETE CASCADE,
  platform TEXT DEFAULT 'meta',
  account_name TEXT,
  account_url TEXT,
  account_id TEXT,
  raw JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(platform, account_url)
);

-- ad_snapshots
CREATE TABLE IF NOT EXISTS ad_snapshots (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT REFERENCES domains(id) ON DELETE CASCADE,
  platform TEXT DEFAULT 'meta',
  active_ads_count INTEGER,
  new_ads_7d INTEGER,
  new_ads_30d INTEGER,
  landing_pages JSONB,
  creative_texts JSONB,
  creative_angles JSONB,
  sample_ads JSONB,
  raw JSONB,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- site_snapshots
CREATE TABLE IF NOT EXISTS site_snapshots (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT REFERENCES domains(id) ON DELETE CASCADE,
  homepage_title TEXT,
  homepage_description TEXT,
  detected_tech JSONB,
  landing_pages JSONB,
  promo_text TEXT,
  raw_html_hash TEXT,
  raw JSONB,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- hiring_snapshots
CREATE TABLE IF NOT EXISTS hiring_snapshots (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT REFERENCES domains(id) ON DELETE CASCADE,
  jobs_count INTEGER,
  growth_jobs_count INTEGER,
  roles JSONB,
  careers_url TEXT,
  raw JSONB,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- growth_scores
CREATE TABLE IF NOT EXISTS growth_scores (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT REFERENCES domains(id) ON DELETE CASCADE,
  score INTEGER,
  paid_media_signal TEXT,
  social_signal TEXT,
  hiring_signal TEXT,
  site_signal TEXT,
  summary TEXT,
  recommended_buyer TEXT,
  recommended_angle TEXT,
  outbound_hook TEXT,
  reasons JSONB,
  model TEXT,
  raw_model_output JSONB,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(domain_id)
);

-- enrichment_jobs
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT REFERENCES domains(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  priority INTEGER DEFAULT 5,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- csv_imports
CREATE TABLE IF NOT EXISTS csv_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  total_rows BIGINT,
  processed_rows BIGINT DEFAULT 0,
  failed_rows BIGINT DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_domains_normalized ON domains(normalized_domain);
CREATE INDEX IF NOT EXISTS idx_social_profiles_domain_platform ON domain_social_profiles(domain_id, platform);
CREATE INDEX IF NOT EXISTS idx_ad_snapshots_domain_checked ON ad_snapshots(domain_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_scores_domain ON growth_scores(domain_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status_scheduled ON enrichment_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_domain ON enrichment_jobs(domain_id);
