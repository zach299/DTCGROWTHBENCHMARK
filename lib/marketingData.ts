// Sample data for the signed-out marketing homepage. Kept separate from the
// components so real API data (from /api/top-movers) can be swapped in with
// the same shapes.

export interface TickerEntry {
  domain: string;
  name: string;
  score: number;
  /** 7-day growth-score change, in percent. Omit to hide the arrow. */
  delta7d?: number;
  signal: string;
  spark: number[];
}

export const TICKER_COMPANIES: TickerEntry[] = [
  { domain: 'jonesroadbeauty.com', name: 'Jones Road Beauty', score: 91, delta7d: 6.2, signal: 'Meta spend accelerating', spark: [42, 45, 44, 51, 56, 61, 68, 74] },
  { domain: 'eightsleep.com', name: 'Eight Sleep', score: 88, delta7d: 4.1, signal: 'Hiring + ad spend rising', spark: [50, 52, 55, 54, 60, 63, 69, 72] },
  { domain: 'ridge.com', name: 'Ridge', score: 86, delta7d: 3.4, signal: 'New landing pages weekly', spark: [58, 57, 60, 62, 61, 66, 70, 73] },
  { domain: 'monos.com', name: 'Monos', score: 79, delta7d: 8.9, signal: 'Traffic entering top 1%', spark: [30, 34, 33, 40, 47, 52, 60, 71] },
  { domain: 'gymshark.com', name: 'Gymshark', score: 94, delta7d: 1.8, signal: 'Sustained paid velocity', spark: [80, 82, 81, 84, 86, 85, 88, 90] },
  { domain: 'ruggable.com', name: 'Ruggable', score: 84, delta7d: -2.1, signal: 'Creative testing cooling', spark: [72, 74, 71, 70, 68, 69, 66, 65] },
  { domain: 'carawayhome.com', name: 'Caraway', score: 82, delta7d: 5.3, signal: 'Retail expansion signals', spark: [44, 47, 50, 49, 55, 58, 63, 67] },
  { domain: 'hexclad.com', name: 'HexClad', score: 87, delta7d: 7.6, signal: 'Meta ads up 31% in 30d', spark: [38, 42, 46, 52, 51, 60, 66, 74] },
  { domain: 'trueclassictees.com', name: 'True Classic', score: 89, delta7d: 2.9, signal: 'New ad angles in testing', spark: [63, 65, 64, 68, 70, 73, 75, 78] },
  { domain: 'drinkolipop.com', name: 'Olipop', score: 92, delta7d: 4.8, signal: 'Hiring growth roles', spark: [55, 58, 62, 61, 67, 71, 76, 81] },
  { domain: 'javycoffee.com', name: 'Javy Coffee', score: 76, delta7d: 11.2, signal: 'Ad spend inflection', spark: [22, 25, 24, 32, 38, 47, 55, 66] },
  { domain: 'kizik.com', name: 'Kizik', score: 85, delta7d: 3.7, signal: 'TV + Meta mix expanding', spark: [49, 53, 52, 58, 60, 64, 67, 70] },
  { domain: 'cozyearth.com', name: 'Cozy Earth', score: 81, delta7d: -1.4, signal: 'Landing pages steady', spark: [66, 68, 67, 69, 66, 67, 65, 66] },
  { domain: 'vivbarefoot.com', name: 'Vivobarefoot', score: 78, delta7d: 6.8, signal: 'Tech stack upgrades live', spark: [35, 39, 41, 45, 44, 52, 58, 63] },
];

export interface NavLink {
  label: string;
  href: string;
  /** Present when the destination doesn't exist yet. */
  comingSoon?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  { label: 'Product', href: '#search' },
  { label: 'Data', href: '#signals' },
  { label: 'Use Cases', href: '#use-cases' },
  { label: 'Solutions', href: '#signals', comingSoon: true },
  { label: 'Pricing', href: '#cta', comingSoon: true },
  { label: 'Resources', href: '#cta', comingSoon: true },
];

export interface SignalCategory {
  name: string;
  blurb: string;
}

export const SIGNAL_CATEGORIES: SignalCategory[] = [
  { name: 'Paid Ads', blurb: 'Active Meta, Google & LinkedIn ads, creative velocity, and spend-band estimates per advertiser.' },
  { name: 'Hiring', blurb: 'Open roles by function from ATS crawls — growth and ops hiring flagged as expansion intent.' },
  { name: 'Website Traffic', blurb: 'Traffic percentile and momentum against a 60k-brand baseline, refreshed on every snapshot.' },
  { name: 'Tech Stack', blurb: 'Detected ad platforms, measurement, backend, and lifecycle tools — plus server-side signals.' },
  { name: 'Revenue Signals', blurb: 'Estimated revenue ranges with confidence scores, derived from sales and pricing telemetry.' },
  { name: 'Landing Pages', blurb: 'Unique landing pages and campaign themes per brand — a leading indicator of new offers.' },
];

export interface UseCase {
  title: string;
  body: string;
}

export const USE_CASES: UseCase[] = [
  {
    title: 'Agencies & consultancies',
    body: 'Find brands entering a scaling phase — rising spend, new creative, growth hires — and pitch while the budget is moving.',
  },
  {
    title: 'B2B sales teams',
    body: 'Prioritize accounts by live growth momentum instead of static firmographics. Reach out when the buying window opens.',
  },
  {
    title: 'Investors & analysts',
    body: 'Track category momentum across 60,000+ DTC brands. Spot breakout companies from signal inflections, not press releases.',
  },
];

export const EXAMPLE_QUERIES: string[] = [
  'DTC brands scaling Meta spend this month',
  'Beauty brands hiring growth marketers',
  'Companies entering the top 1% of traffic',
  'Home goods brands testing new landing pages',
  'Brands that just adopted Klaviyo',
  'Apparel companies with rising ad velocity',
];
