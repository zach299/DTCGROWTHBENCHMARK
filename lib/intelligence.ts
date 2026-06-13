// Derived intelligence helpers — turn raw counts into the "why is this growing"
// signals: Growth Momentum and trustworthy revenue ranges (no fake precision).

export type Momentum = 'Dormant' | 'Emerging' | 'Scaling' | 'Accelerating' | 'Exploding';

export const MOMENTUM_EMOJI: Record<Momentum, string> = {
  Dormant: '😴',
  Emerging: '🌱',
  Scaling: '📈',
  Accelerating: '🚀',
  Exploding: '💥',
};

export interface MomentumInput {
  metaAds: number;
  googleAds: number;
  linkedinAds: number;
  landingPages: number;
  campaignDiversity: number; // distinct campaign themes
  revenue: number;
  paidIntensity: string; // 'high' | 'medium' | 'low'
}

export interface MomentumResult {
  label: Momentum;
  score: number; // 0-100, for ranking
}

export function computeMomentum(i: MomentumInput): MomentumResult {
  let s = 0;
  const totalAds = i.metaAds + i.googleAds + i.linkedinAds;

  // Paid acquisition volume across all platforms (0-40).
  s += Math.min(40, totalAds * 0.4);
  // Funnel breadth (0-15).
  s += Math.min(15, i.landingPages * 1.5);
  // Campaign diversity (0-10).
  s += Math.min(10, i.campaignDiversity * 2);
  // Revenue scale, log so it doesn't dominate (0-20).
  if (i.revenue > 0) s += Math.min(20, Math.log10(i.revenue) * 2.2);
  // Paid media intensity (0-15).
  s +=
    i.paidIntensity === 'high'
      ? 15
      : i.paidIntensity === 'medium'
        ? 9
        : i.paidIntensity === 'low'
          ? 4
          : 0;

  const score = Math.round(Math.max(0, Math.min(100, s)));
  let label: Momentum;
  if (score >= 80) label = 'Exploding';
  else if (score >= 60) label = 'Accelerating';
  else if (score >= 38) label = 'Scaling';
  else if (score >= 18) label = 'Emerging';
  else label = 'Dormant';

  return { label, score };
}

export interface RevenueRange {
  range: string; // e.g. "$100M – $150M"
  confidence: 'Low' | 'Medium' | 'High';
}

// Bucket an exact estimate into a trustworthy range. Never show fake precision.
export function revenueRange(n: number, corroborated = false): RevenueRange {
  if (!n || n <= 0) return { range: 'Unknown', confidence: 'Low' };

  const M = 1_000_000;
  const B = 1_000_000_000;
  let range: string;
  if (n < 1 * M) range = '< $1M';
  else if (n < 5 * M) range = '$1M – $5M';
  else if (n < 10 * M) range = '$5M – $10M';
  else if (n < 25 * M) range = '$10M – $25M';
  else if (n < 50 * M) range = '$25M – $50M';
  else if (n < 100 * M) range = '$50M – $100M';
  else if (n < 150 * M) range = '$100M – $150M';
  else if (n < 250 * M) range = '$150M – $250M';
  else if (n < 500 * M) range = '$250M – $500M';
  else if (n < 1 * B) range = '$500M – $1B';
  else range = '$1B+';

  // Confidence: corroborating signals (followers etc.) raise it; tiny/huge
  // outliers and missing data lower it.
  const confidence: RevenueRange['confidence'] = corroborated ? 'High' : 'Medium';
  return { range, confidence };
}

// ---------------------------------------------------------------------------
// Phase 8: internal revenue MODELING (don't rely solely on Store Leads).
// We blend the seed revenue (if any) with paid-media + audience signals to
// produce a coarse range and an honest confidence — never fake precision.
// ---------------------------------------------------------------------------

export const REVENUE_BANDS = [
  '< $1M',
  '$1M – $10M',
  '$10M – $50M',
  '$50M – $100M',
  '$100M – $250M',
  '$250M+',
] as const;
export type RevenueBand = (typeof REVENUE_BANDS)[number];

export interface RevenueModelInput {
  seedRevenue?: number | null; // Store Leads estimated_yearly_sales
  metaAds?: number;
  googleAds?: number;
  linkedinAds?: number;
  landingPages?: number;
  campaignDiversity?: number; // 0-n distinct themes
  followers?: number | null;
  paidIntensity?: string; // 'high' | 'medium' | 'low'
}

export interface RevenueModelResult {
  range: RevenueBand;
  confidence: 'Low' | 'Medium' | 'High';
  modeled_value: number; // midpoint estimate, for ranking only (not displayed)
}

function bandIndexFromValue(n: number): number {
  const M = 1_000_000;
  if (n < 1 * M) return 0;
  if (n < 10 * M) return 1;
  if (n < 50 * M) return 2;
  if (n < 100 * M) return 3;
  if (n < 250 * M) return 4;
  return 5;
}

const BAND_MIDPOINTS = [500_000, 5_000_000, 30_000_000, 75_000_000, 175_000_000, 400_000_000];

/**
 * Model an estimated revenue band from multiple signals.
 *
 * Approach: derive a "paid-media implied" band from ad volume + funnel breadth
 * + audience, then reconcile it with the seed revenue band. Agreement → High
 * confidence; one strong source → Medium; thin signal → Low.
 */
export function modelRevenue(i: RevenueModelInput): RevenueModelResult {
  const meta = i.metaAds ?? 0;
  const google = i.googleAds ?? 0;
  const linkedin = i.linkedinAds ?? 0;
  const totalAds = meta + google + linkedin;
  const lps = i.landingPages ?? 0;
  const followers = i.followers ?? 0;

  // Signal-implied score → band. Heavy advertisers and broad funnels skew up.
  let sig = 0;
  sig += Math.min(45, totalAds * 0.6); // ad volume
  sig += Math.min(15, lps * 1.2); // funnel breadth
  sig += Math.min(10, (i.campaignDiversity ?? 0) * 2); // diversity
  if (followers > 0) sig += Math.min(15, Math.log10(followers) * 3); // audience
  sig +=
    i.paidIntensity === 'high' ? 15 : i.paidIntensity === 'medium' ? 8 : i.paidIntensity === 'low' ? 3 : 0;

  // Map 0-100 signal score to a band index 0-5.
  let signalBand: number;
  if (sig >= 78) signalBand = 5;
  else if (sig >= 58) signalBand = 4;
  else if (sig >= 40) signalBand = 3;
  else if (sig >= 22) signalBand = 2;
  else if (sig >= 8) signalBand = 1;
  else signalBand = 0;

  const hasSeed = !!i.seedRevenue && i.seedRevenue > 0;
  const seedBand = hasSeed ? bandIndexFromValue(i.seedRevenue as number) : null;

  let finalBand: number;
  let confidence: RevenueModelResult['confidence'];
  if (seedBand != null) {
    // Blend: lean toward seed but let strong signals nudge it up to one band.
    finalBand = Math.round(seedBand * 0.65 + signalBand * 0.35);
    const agree = Math.abs(seedBand - signalBand) <= 1;
    confidence = agree ? 'High' : 'Medium';
  } else {
    finalBand = signalBand;
    // No seed: confidence rests on how much signal we actually have.
    confidence = totalAds >= 20 || followers > 50_000 ? 'Medium' : 'Low';
  }
  finalBand = Math.max(0, Math.min(5, finalBand));

  return {
    range: REVENUE_BANDS[finalBand],
    confidence,
    modeled_value: BAND_MIDPOINTS[finalBand],
  };
}

// ---------------------------------------------------------------------------
// Spend band — directional monthly paid-media spend (never exact).
// ---------------------------------------------------------------------------
export const SPEND_BANDS = [
  '< $100k/mo',
  '$100k – $500k/mo',
  '$500k – $1M/mo',
  '$1M – $5M/mo',
  '$5M+/mo',
] as const;
export type SpendBand = (typeof SPEND_BANDS)[number];

export interface SpendBandInput {
  metaAds?: number;
  googleAds?: number;
  linkedinAds?: number;
  paidIntensity?: string;
}

// Rough heuristic: more concurrently-active ads ⇒ higher sustained spend.
// Active ad count is a proxy for creative volume, which tracks spend loosely.
export function spendBand(i: SpendBandInput): SpendBand {
  const total = (i.metaAds ?? 0) + (i.googleAds ?? 0) + (i.linkedinAds ?? 0);
  const boost = i.paidIntensity === 'high' ? 1.3 : i.paidIntensity === 'medium' ? 1.0 : 0.8;
  const weighted = total * boost;
  if (weighted >= 1000) return '$5M+/mo';
  if (weighted >= 400) return '$1M – $5M/mo';
  if (weighted >= 150) return '$500k – $1M/mo';
  if (weighted >= 30) return '$100k – $500k/mo';
  return '< $100k/mo';
}
