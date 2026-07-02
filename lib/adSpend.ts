// Estimated monthly ad spend — a deliberately honest heuristic.
//
// We never see actual spend, so this models a RANGE from observable signals:
// active ad volume (quality-adjusted where available), creative diversity,
// landing-page breadth, revenue bucket, and paid-media intensity. Output is a
// low/high band plus a confidence level; UI copy should always present it as
// an estimate ("Estimated from ad volume, creative diversity, category, and
// revenue signals.").

export interface SpendEstimate {
  low: number; // dollars / month
  high: number;
  label: string; // "$100k – $250k"
  confidence: 'low' | 'medium' | 'high';
}

export interface SpendInputs {
  metaAds: number;
  googleAds?: number | null;
  linkedinAds?: number | null;
  qualityAdjustedAds?: number | null; // preferred over raw meta count when present
  landingPages?: number | null;
  creativeDiversityScore?: number | null; // 0-100
  revenueRange?: string | null; // e.g. "$10M–$50M"
  paidIntensity?: string | null; // high | medium | low | none
}

// Midpoint of the revenue range string in $M (rough parse, tolerant of formats).
function revenueMidM(range: string | null | undefined): number | null {
  if (!range) return null;
  const nums = [...range.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(M|K|B)?/gi)].map((m) => {
    const n = parseFloat(m[1]);
    const unit = (m[2] || 'M').toUpperCase();
    return unit === 'B' ? n * 1000 : unit === 'K' ? n / 1000 : n;
  });
  if (nums.length === 0) return null;
  if (nums.length === 1) return nums[0];
  return (nums[0] + nums[1]) / 2;
}

function roundBand(v: number): number {
  // Round to a "clean" band edge so we never imply precision.
  if (v >= 1_000_000) return Math.round(v / 250_000) * 250_000;
  if (v >= 250_000) return Math.round(v / 50_000) * 50_000;
  if (v >= 50_000) return Math.round(v / 25_000) * 25_000;
  if (v >= 10_000) return Math.round(v / 5_000) * 5_000;
  return Math.round(v / 1_000) * 1_000;
}

export function formatSpend(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}

/**
 * Estimate monthly paid-media spend as a band.
 *
 * Core model: each genuinely active ad implies a monthly budget slice. DPA/
 * catalog volume implies less per ad than hand-built creative, so we prefer
 * the quality-adjusted count. Revenue caps the band (brands rarely spend more
 * than ~20% of revenue on paid), and intensity/diversity widen or narrow it.
 */
export function estimateMonthlySpend(i: SpendInputs): SpendEstimate | null {
  const effectiveAds = i.qualityAdjustedAds != null && i.qualityAdjustedAds > 0
    ? i.qualityAdjustedAds
    : i.metaAds;
  const totalAds = effectiveAds + (i.googleAds ?? 0) * 0.8 + (i.linkedinAds ?? 0) * 1.5;

  if (totalAds <= 0) return null; // no observable paid activity — don't invent a number

  // Base: ~$400-$1,200 of monthly spend per effective active ad, scaled by
  // volume (bigger accounts run more spend per ad, not less).
  const scale = totalAds >= 200 ? 1.6 : totalAds >= 75 ? 1.3 : totalAds >= 25 ? 1.0 : 0.7;
  let low = totalAds * 400 * scale;
  let high = totalAds * 1200 * scale;

  // Landing-page breadth signals real campaign infrastructure.
  const lps = i.landingPages ?? 0;
  if (lps >= 10) { low *= 1.15; high *= 1.25; }

  // Diversity: heavy catalog (low diversity) narrows toward the low end.
  const div = i.creativeDiversityScore;
  if (div != null && div < 25) high *= 0.7;

  // Revenue cap: paid spend rarely exceeds ~20% of revenue / 12.
  const revM = revenueMidM(i.revenueRange);
  let confidence: SpendEstimate['confidence'] = 'low';
  if (revM != null) {
    const monthlyCap = (revM * 1_000_000 * 0.2) / 12;
    high = Math.min(high, monthlyCap);
    low = Math.min(low, high * 0.5);
    confidence = 'medium';
  }

  // Intensity agreement raises confidence.
  if (i.paidIntensity === 'high' && totalAds >= 50 && revM != null) confidence = 'high';
  if (i.paidIntensity === 'none' || totalAds < 5) confidence = 'low';

  low = Math.max(1_000, roundBand(low));
  high = Math.max(low * 1.5, roundBand(high));

  return {
    low,
    high,
    label: `${formatSpend(low)} – ${formatSpend(high)}`,
    confidence,
  };
}
