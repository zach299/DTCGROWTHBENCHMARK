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
  /** Which anchors produced the estimate. */
  basis: 'blended' | 'ads_only';
  /** Human-readable list of why the band/confidence landed where it did. */
  explanation: string[];
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
export function revenueMidM(range: string | null | undefined): number | null {
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
 * Two anchors, blended:
 *  1. Ad-volume anchor with DIMINISHING returns per ad — large ad counts are
 *     dominated by catalog/DPA variants, so the marginal ad implies far less
 *     budget than the first 25 hand-built creatives.
 *  2. Revenue anchor — DTC brands typically put ~8-12% of revenue into paid
 *     media; monthly budget ~= revenue * 10% / 12, scaled by observed paid
 *     intensity.
 * When both exist we take the geometric mean (log-scale midpoint) so neither
 * anchor can run away; the band is +/- around that midpoint. Ads-only
 * estimates get a wider band and lower confidence.
 */
export function estimateMonthlySpend(i: SpendInputs): SpendEstimate | null {
  const effectiveAds = i.qualityAdjustedAds != null && i.qualityAdjustedAds > 0
    ? i.qualityAdjustedAds
    : i.metaAds;
  const totalAds = effectiveAds + (i.googleAds ?? 0) * 0.8 + (i.linkedinAds ?? 0) * 1.5;

  if (totalAds <= 0) return null; // no observable paid activity — don't invent a number

  // --- Anchor 1: tiered per-ad budget (diminishing returns) ---
  // First 25 ads ~ $800/mo each (hand-built creative under active management),
  // next 75 ~ $500, next 400 ~ $200, everything beyond ~ $60 (catalog tail).
  const tiers: [number, number][] = [
    [25, 800],
    [75, 500],
    [400, 200],
    [Infinity, 60],
  ];
  let remaining = totalAds;
  let adAnchor = 0;
  for (const [size, rate] of tiers) {
    const n = Math.min(remaining, size);
    adAnchor += n * rate;
    remaining -= n;
    if (remaining <= 0) break;
  }
  // Heavy-catalog mixes imply even less per ad; strong diversity implies more.
  const div = i.creativeDiversityScore;
  if (div != null && div < 25) adAnchor *= 0.75;
  if (div != null && div >= 60) adAnchor *= 1.15;
  if ((i.landingPages ?? 0) >= 10) adAnchor *= 1.1;

  // --- Anchor 2: revenue-based budget ---
  const revM = revenueMidM(i.revenueRange);
  const intensityScale =
    i.paidIntensity === 'high' ? 1.25 : i.paidIntensity === 'medium' ? 1.0 : i.paidIntensity === 'low' ? 0.5 : 0.3;
  const revAnchor = revM != null ? ((revM * 1_000_000 * 0.10) / 12) * intensityScale : null;

  // --- Blend: geometric mean when both anchors exist ---
  const explanation: string[] = [
    `${Math.round(totalAds)} effective active ads across channels`,
  ];
  if (i.qualityAdjustedAds != null && i.qualityAdjustedAds > 0 && i.qualityAdjustedAds < i.metaAds) {
    explanation.push(`catalog/DPA volume discounted (${i.metaAds} raw → ${i.qualityAdjustedAds} effective)`);
  }
  if (div != null && div < 25) explanation.push('low creative diversity narrows the band');
  if (div != null && div >= 60) explanation.push('high creative diversity raises the band');

  let mid: number;
  let confidence: SpendEstimate['confidence'];
  let basis: SpendEstimate['basis'];
  if (revAnchor != null && revAnchor > 0) {
    mid = Math.sqrt(adAnchor * revAnchor);
    basis = 'blended';
    confidence = 'medium';
    explanation.push(`anchored to revenue (${i.revenueRange}, ~10%/12 paid budget)`);
    if (i.paidIntensity === 'high' && totalAds >= 50) {
      confidence = 'high';
      explanation.push('high paid intensity + revenue agreement → high confidence');
    }
  } else {
    mid = adAnchor;
    basis = 'ads_only';
    confidence = 'low';
    explanation.push('no revenue signal — ads-only estimate, wide band, low confidence');
  }
  if (i.paidIntensity === 'none' || totalAds < 5) {
    confidence = 'low';
    if (totalAds < 5) explanation.push('very low ad count — low confidence');
  }

  // Hard ceiling: paid spend rarely exceeds ~20% of revenue / 12.
  if (revM != null && mid > (revM * 1_000_000 * 0.2) / 12) {
    mid = (revM * 1_000_000 * 0.2) / 12;
    explanation.push('capped at ~20% of revenue / 12');
  }

  // Band width: tighter when both anchors agree, wider on ads-only.
  const spreadLow = basis === 'blended' ? 0.6 : 0.45;
  const spreadHigh = basis === 'blended' ? 1.6 : 2.2;
  const low = Math.max(1_000, roundBand(mid * spreadLow));
  const high = Math.max(low * 1.5, roundBand(mid * spreadHigh));

  return {
    low,
    high,
    label: `${formatSpend(low)} – ${formatSpend(high)}`,
    confidence,
    basis,
    explanation,
  };
}
