// Estimated ANNUAL ad spend — calibrated to DTC reality: brands with a real
// paid motion put roughly 20-40% of revenue into media annually. Where a brand
// sits in that range is driven by its ad-volume-to-revenue ratio (more active
// ads per $M of revenue = a more aggressive media mix), nudged by momentum and
// gated by observed paid intensity. Displayed as a RANGE, never a point.

export interface SpendEstimate {
  /** Annual dollars. */
  low: number;
  high: number;
  /** e.g. "$70M – $100M" (annual). */
  label: string;
  /** Monthly equivalents for filters ("spending $100k+/mo"). */
  monthly_low: number;
  monthly_high: number;
  confidence: 'low' | 'medium' | 'high';
  basis: 'revenue_pct' | 'ads_only';
  /** Share of revenue the midpoint represents (null for ads_only). */
  pct_of_revenue: number | null;
  explanation: string[];
}

export interface SpendInputs {
  metaAds: number;
  googleAds?: number | null;
  linkedinAds?: number | null;
  qualityAdjustedAds?: number | null; // preferred for the intensity ratio
  landingPages?: number | null;
  creativeDiversityScore?: number | null; // 0-100
  revenueRange?: string | null; // e.g. "$10M–$50M"
  paidIntensity?: string | null; // high | medium | low | none
  momentum?: string | null; // Exploding | Accelerating | ...
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
  if (v >= 10_000_000) return Math.round(v / 1_000_000) * 1_000_000;
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
 * Estimate ANNUAL paid-media spend as a band.
 *
 * Model: annual = revenue x pct x intensity, where pct runs 20% -> 40% driven
 * by effective-ads-per-$M-revenue (log scale), +bump for accelerating/exploding
 * momentum. Two guards keep it sane:
 *  - per-ad ceiling: no brand spends more than ~$20k/mo per active ad, so a
 *    handful of always-on ads can't inherit a mega-revenue budget;
 *  - per-ad floor: real ads cost something (~$300/mo each minimum).
 * Without a revenue signal we fall back to a tiered per-ad annual anchor with
 * a wide band and low confidence.
 */
export function estimateAdSpend(i: SpendInputs): SpendEstimate | null {
  const effectiveAds = i.qualityAdjustedAds != null && i.qualityAdjustedAds > 0
    ? i.qualityAdjustedAds
    : i.metaAds;
  const totalAds = effectiveAds + (i.googleAds ?? 0) * 0.8 + (i.linkedinAds ?? 0) * 1.5;
  if (totalAds <= 0) return null; // no observable paid activity — don't invent a number

  const explanation: string[] = [
    `${Math.round(totalAds)} effective active ads across channels`,
  ];
  if (i.qualityAdjustedAds != null && i.qualityAdjustedAds > 0 && i.qualityAdjustedAds < i.metaAds) {
    explanation.push(`catalog/DPA volume discounted (${i.metaAds} raw → ${i.qualityAdjustedAds} effective)`);
  }

  const revM = revenueMidM(i.revenueRange);
  let annualMid: number;
  let confidence: SpendEstimate['confidence'];
  let basis: SpendEstimate['basis'];
  let pctOfRevenue: number | null = null;

  if (revM != null && revM > 0) {
    basis = 'revenue_pct';
    // Ads-per-$M drives where in the 20-40% band the brand sits.
    const adsPerM = totalAds / revM;
    let pct = 0.20 + 0.05 * Math.log2(1 + adsPerM);
    if (i.momentum === 'Exploding') { pct += 0.04; explanation.push('exploding momentum pushes toward the top of the range'); }
    else if (i.momentum === 'Accelerating') pct += 0.02;
    pct = Math.min(0.40, Math.max(0.18, pct));

    const intensityScale =
      i.paidIntensity === 'high' ? 1.0 : i.paidIntensity === 'medium' ? 0.75 : i.paidIntensity === 'low' ? 0.4 : 0.25;

    annualMid = revM * 1_000_000 * pct * intensityScale;
    pctOfRevenue = Math.round(pct * intensityScale * 1000) / 1000;
    explanation.push(
      `~${Math.round(pct * intensityScale * 100)}% of est. revenue (${i.revenueRange}) — media share scales with ads-per-$M (${adsPerM.toFixed(1)})`
    );

    // Per-ad ceiling/floor keep the revenue model honest at the extremes.
    const ceiling = i.metaAds > 0 ? Math.max(i.metaAds, totalAds) * 20_000 * 12 : totalAds * 20_000 * 12;
    if (annualMid > ceiling) {
      annualMid = ceiling;
      pctOfRevenue = null;
      explanation.push('capped by ad volume — too few active ads to carry a revenue-scale budget');
    }
    const floor = totalAds * 300 * 12;
    if (annualMid < floor) annualMid = floor;

    confidence = i.paidIntensity === 'high' && totalAds >= 50 ? 'high' : 'medium';
  } else {
    basis = 'ads_only';
    // Tiered per-ad monthly anchor (diminishing returns), annualized.
    const tiers: [number, number][] = [[25, 800], [75, 500], [400, 200], [Infinity, 60]];
    let remaining = totalAds;
    let monthly = 0;
    for (const [size, rate] of tiers) {
      const n = Math.min(remaining, size);
      monthly += n * rate;
      remaining -= n;
      if (remaining <= 0) break;
    }
    const div = i.creativeDiversityScore;
    if (div != null && div < 25) monthly *= 0.75;
    if (div != null && div >= 60) monthly *= 1.15;
    annualMid = monthly * 12;
    confidence = 'low';
    explanation.push('no revenue signal — ads-only estimate, wide band, low confidence');
  }
  if (i.paidIntensity === 'none' || totalAds < 5) {
    confidence = 'low';
    if (totalAds < 5) explanation.push('very low ad count — low confidence');
  }

  const spreadLow = basis === 'revenue_pct' ? 0.8 : 0.45;
  const spreadHigh = basis === 'revenue_pct' ? 1.25 : 2.2;
  const low = Math.max(3_000, roundBand(annualMid * spreadLow));
  const high = Math.max(low * 1.2, roundBand(annualMid * spreadHigh));

  return {
    low,
    high,
    label: `${formatSpend(low)} – ${formatSpend(high)}`,
    monthly_low: Math.round(low / 12),
    monthly_high: Math.round(high / 12),
    confidence,
    basis,
    pct_of_revenue: pctOfRevenue,
    explanation,
  };
}

/** @deprecated renamed — estimates are ANNUAL now. Kept for grep-ability. */
export const estimateMonthlySpend = estimateAdSpend;
