// Peer benchmarking — turn the enriched dataset into category & channel
// benchmarks so any company can be placed against its peers ("Top 1% in
// Apparel", "Below median on LinkedIn"). Pure functions over plain rows so the
// same logic runs in API routes and the MCP server.

export interface BenchRow {
  primary_category: string | null;
  active_meta_ads: number;
  google_ads: number;
  linkedin_ads: number;
  landing_pages_count: number;
  growth_score: number;
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Value at the top-`pct` threshold (e.g. pct=10 → the value the top 10% exceed).
export function topThreshold(nums: number[], pct: number): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => b - a); // desc
  const idx = Math.max(0, Math.min(s.length - 1, Math.floor((pct / 100) * s.length)));
  return s[idx];
}

// What top-percentile does `value` sit in among `all`? Returns 1..100 (1 = top).
// Ties count as "at least this good", so the leader is Top 1%.
export function percentileTop(value: number, all: number[]): number | null {
  if (all.length === 0) return null;
  const better = all.filter((v) => v > value).length;
  return Math.max(1, Math.ceil(((better + 1) / all.length) * 100));
}

// Rank of `value` within `all` (1 = highest). Equal values share the lower rank.
export function rankOf(value: number, all: number[]): number {
  return all.filter((v) => v > value).length + 1;
}

export interface CategoryBenchmark {
  primary_category: string;
  count: number;
  median_meta_ads: number;
  median_google_ads: number;
  median_linkedin_ads: number;
  median_landing_pages: number;
  meta_top10_threshold: number;
  meta_top1_threshold: number;
  avg_growth_score: number;
}

export function computeCategoryBenchmarks(rows: BenchRow[]): CategoryBenchmark[] {
  const byCat = new Map<string, BenchRow[]>();
  for (const r of rows) {
    const cat = r.primary_category || 'Other';
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(r);
  }
  const out: CategoryBenchmark[] = [];
  for (const [cat, rs] of byCat) {
    const meta = rs.map((r) => r.active_meta_ads || 0);
    const scores = rs.map((r) => r.growth_score || 0);
    out.push({
      primary_category: cat,
      count: rs.length,
      median_meta_ads: median(meta),
      median_google_ads: median(rs.map((r) => r.google_ads || 0)),
      median_linkedin_ads: median(rs.map((r) => r.linkedin_ads || 0)),
      median_landing_pages: median(rs.map((r) => r.landing_pages_count || 0)),
      meta_top10_threshold: topThreshold(meta, 10),
      meta_top1_threshold: topThreshold(meta, 1),
      avg_growth_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

// A human label for where a value sits ("Top 1%", "Top 25%", "Below median").
export function benchmarkLabel(value: number, all: number[]): string {
  if (all.length === 0 || value <= 0) return 'No data';
  const pct = percentileTop(value, all);
  if (pct == null) return 'No data';
  const med = median(all);
  if (value < med) return 'Below median';
  if (pct <= 1) return 'Top 1%';
  if (pct <= 5) return 'Top 5%';
  if (pct <= 10) return 'Top 10%';
  if (pct <= 25) return 'Top 25%';
  return `Top ${pct}%`;
}

export interface ChannelBenchmark {
  channel: 'Meta' | 'Google' | 'LinkedIn';
  ads: number;
  overall_rank: number | null;
  overall_percentile_top: number | null;
  overall_label: string;
  category_rank: number | null;
  category_percentile_top: number | null;
  category_label: string;
}

// Build the three-channel benchmark block for one company given the full
// dataset (`all`) and its category peers (`peers`).
export function channelBenchmarks(
  company: { meta: number; google: number; linkedin: number },
  all: BenchRow[],
  peers: BenchRow[]
): ChannelBenchmark[] {
  const channels: { channel: ChannelBenchmark['channel']; value: number; key: keyof BenchRow }[] = [
    { channel: 'Meta', value: company.meta, key: 'active_meta_ads' },
    { channel: 'Google', value: company.google, key: 'google_ads' },
    { channel: 'LinkedIn', value: company.linkedin, key: 'linkedin_ads' },
  ];
  return channels.map(({ channel, value, key }) => {
    const allVals = all.map((r) => Number(r[key]) || 0);
    const peerVals = peers.map((r) => Number(r[key]) || 0);
    return {
      channel,
      ads: value,
      overall_rank: value > 0 ? rankOf(value, allVals) : null,
      overall_percentile_top: value > 0 ? percentileTop(value, allVals) : null,
      overall_label: benchmarkLabel(value, allVals),
      category_rank: value > 0 ? rankOf(value, peerVals) : null,
      category_percentile_top: value > 0 ? percentileTop(value, peerVals) : null,
      category_label: benchmarkLabel(value, peerVals),
    };
  });
}
