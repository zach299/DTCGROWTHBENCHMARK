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
