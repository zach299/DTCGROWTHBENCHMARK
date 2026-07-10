// Signal-category registry — the composite-growth data model.
//
// The Growth Score is presented as multi-signal intelligence. Each category is
// a self-contained descriptor; new sources plug in by flipping status to
// 'live' and supplying metrics from their builder — no page rework.

export interface SignalMetric {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'muted';
}

export interface SignalCategory {
  key: string;
  label: string;
  status: 'live' | 'coming_soon';
  blurb: string; // live: what it contributes; coming_soon: what it will add
  metrics: SignalMetric[];
}

export interface SignalRowLike {
  active_meta_ads?: number | null;
  google_ads?: number | null;
  linkedin_ads?: number | null;
  quality_adjusted_ads?: number | null;
  real_creative_score?: number | null;
  creative_diversity_score?: number | null;
  dpa_share?: number | null;
  landing_pages?: unknown;
  ad_activity_level?: string | null;
  spend_label?: string | null; // formatted annual band
}

const intensityLabel = (v?: string | null) =>
  v === 'high' ? 'High' : v === 'medium' ? 'Medium' : v === 'low' ? 'Low' : 'None';

/** Build the full category grid from whatever signal data exists. */
export function buildSignalCategories(row: SignalRowLike): SignalCategory[] {
  const meta = Number(row.active_meta_ads ?? 0);
  const google = Number(row.google_ads ?? 0);
  const linkedin = Number(row.linkedin_ads ?? 0);
  const lps = Array.isArray(row.landing_pages) ? row.landing_pages.length : 0;

  const paidMetrics: SignalMetric[] = [];
  if (meta > 0) paidMetrics.push({ label: 'Active Meta ads', value: String(meta) });
  if (row.quality_adjusted_ads != null && Number(row.quality_adjusted_ads) < meta) {
    paidMetrics.push({ label: 'Effective creatives', value: `~${row.quality_adjusted_ads}` });
  }
  if (google > 0) paidMetrics.push({ label: 'Google ads', value: String(google) });
  if (linkedin > 0) paidMetrics.push({ label: 'LinkedIn ads', value: String(linkedin) });
  if (row.real_creative_score != null) {
    paidMetrics.push({
      label: 'Creative score',
      value: `${row.real_creative_score}/100`,
      tone: Number(row.real_creative_score) >= 55 ? 'positive' : 'default',
    });
  }
  if (lps > 0) paidMetrics.push({ label: 'Campaign destinations', value: String(lps) });
  paidMetrics.push({ label: 'Growth Investment Intensity', value: intensityLabel(row.ad_activity_level) });
  if (row.spend_label) paidMetrics.push({ label: 'Growth investment', value: `${row.spend_label}/yr` });

  return [
    {
      key: 'paid_media',
      label: 'Paid Media',
      status: 'live',
      blurb: 'Live acquisition activity observed across ad platforms — the strongest near-term growth evidence.',
      metrics: paidMetrics,
    },
    {
      key: 'hiring',
      label: 'Hiring Velocity',
      status: 'coming_soon',
      blurb: 'Open roles and team growth — headcount expansion is a committed-spend growth signal.',
      metrics: [],
    },
    {
      key: 'tech_stack',
      label: 'Tech Stack Changes',
      status: 'coming_soon',
      blurb: 'New tools added or swapped — stack movement marks investment and vendor-evaluation windows.',
      metrics: [],
    },
    {
      key: 'product_sku',
      label: 'Product & SKU Expansion',
      status: 'coming_soon',
      blurb: 'Catalog growth, new collections, and regional storefronts — operational scale in motion.',
      metrics: [],
    },
    {
      key: 'funding',
      label: 'Funding & Filings',
      status: 'coming_soon',
      blurb: 'Raises and registrations that put fresh budget behind growth plans.',
      metrics: [],
    },
    {
      key: 'reviews_traffic',
      label: 'Reviews & Traffic',
      status: 'coming_soon',
      blurb: 'Review velocity and traffic trend — demand-side confirmation of the growth read.',
      metrics: [],
    },
  ];
}
