// Natural-language → TAM filter parser. Deterministic keyword parsing — no AI
// call, so it's instant and predictable. "Find fastest-growing Shopify beauty
// brands doing $10M–$100M in revenue" → structured filters.

export interface TamFilters {
  category?: string;
  platform?: string;
  revenueMinM?: number; // $M
  revenueMaxM?: number;
  spendMinMo?: number; // $/month
  spendMaxMo?: number;
  metaAdsMin?: number;
  growthScoreMin?: number;
  momentum?: string[]; // e.g. ['Accelerating','Exploding']
  newlyEnriched?: boolean; // enriched in last 7d
  top1pct?: boolean;
  sort?: 'growth' | 'spend' | 'meta_ads' | 'newest';
}

const CATEGORIES = [
  'beauty', 'apparel', 'fashion', 'home goods', 'home', 'food', 'beverage',
  'health', 'wellness', 'fitness', 'jewelry', 'accessories', 'electronics',
  'pets', 'pet', 'baby', 'kids', 'outdoor', 'sports', 'furniture', 'skincare',
  'supplements', 'footwear', 'toys',
];

// "$10M–$100M", "$10m to $100m", "over $50M", "under $20M"
function parseMoney(s: string): number | null {
  const m = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(k|m|b)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'b') return n * 1000;
  if (unit === 'k') return n / 1000;
  return n; // default $M for revenue context
}

export function parseTamQuery(q: string): TamFilters {
  const s = q.toLowerCase();
  const f: TamFilters = {};

  // Category
  for (const c of CATEGORIES) {
    if (s.includes(c)) {
      f.category = c === 'fashion' ? 'apparel' : c === 'pet' ? 'pets' : c;
      break;
    }
  }

  // Platform
  if (s.includes('shopify')) f.platform = 'shopify';

  // Revenue range: "$10M–$100M" / "$10m to $100m" / "doing $10M-$100M"
  const revRange = s.match(/\$\s*(\d+(?:\.\d+)?)\s*(k|m|b)?\s*(?:–|-|to)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k|m|b)?(?:\s*(?:in|of)?\s*rev)?/i);
  if (revRange && /rev|doing|sales|size/.test(s)) {
    f.revenueMinM = parseMoney(`${revRange[1]}${revRange[2] || 'm'}`) ?? undefined;
    f.revenueMaxM = parseMoney(`${revRange[3]}${revRange[4] || 'm'}`) ?? undefined;
  }

  // Monthly spend: "$100k+/mo", "spending $100k+", "high ad spend"
  const spend = s.match(/\$\s*(\d+(?:\.\d+)?)\s*(k|m)?\s*\+?\s*(?:\/|per\s*)?(?:mo|month)/i);
  if (spend) {
    const v = parseFloat(spend[1]) * (spend[2]?.toLowerCase() === 'm' ? 1_000_000 : 1_000);
    f.spendMinMo = v;
  } else if (/high (ad )?spend|big spender|heavy spend/.test(s)) {
    f.spendMinMo = 100_000;
  }

  // Meta ads / creative testing signals
  if (/scaling meta|meta ads/.test(s)) f.metaAdsMin = Math.max(f.metaAdsMin ?? 0, 25);
  if (/creative testing|strong creative/.test(s)) f.metaAdsMin = Math.max(f.metaAdsMin ?? 0, 10);

  // Momentum
  if (/accelerat|newly growing|scaling|momentum|fastest.growing|exploding/.test(s)) {
    f.momentum = ['Accelerating', 'Exploding', 'Scaling'];
  }
  if (/fastest.growing|top mover/.test(s)) f.sort = 'growth';
  if (/highest spend|most spend|biggest spend/.test(s)) f.sort = 'spend';
  if (/most (meta )?ads/.test(s)) f.sort = 'meta_ads';
  if (/newly enriched|recently (added|tracked)|new(ly)? (growing|discovered)/.test(s)) f.newlyEnriched = true;
  if (/top 1%|top one percent|entering top/.test(s)) f.top1pct = true;

  if (!f.sort) f.sort = 'growth';
  return f;
}

/** Human-readable summary of applied filters, for the results header. */
export function describeFilters(f: TamFilters): string[] {
  const parts: string[] = [];
  if (f.category) parts.push(`Category: ${f.category}`);
  if (f.platform) parts.push(`Platform: ${f.platform}`);
  if (f.revenueMinM != null || f.revenueMaxM != null) {
    parts.push(`Revenue: $${f.revenueMinM ?? 0}M – ${f.revenueMaxM != null ? `$${f.revenueMaxM}M` : 'any'}`);
  }
  if (f.spendMinMo != null) parts.push(`Est. spend ≥ $${Math.round(f.spendMinMo / 1000)}k/mo`);
  if (f.metaAdsMin) parts.push(`Meta ads ≥ ${f.metaAdsMin}`);
  if (f.momentum?.length) parts.push(`Momentum: ${f.momentum.join(' / ')}`);
  if (f.newlyEnriched) parts.push('Newly enriched');
  if (f.top1pct) parts.push('Top 1%');
  return parts;
}
