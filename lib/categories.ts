// Category normalization — collapse raw Store Leads category strings
// (e.g. "/Apparel/Clothing Accessories", "Health & Beauty > Supplements")
// into ~15 clean top-level categories plus a subcategory, with a confidence.
//
// Used everywhere (dashboard, profile, extension, MCP, benchmarks) so peers are
// always compared within a consistent taxonomy.

export const TOP_CATEGORIES = [
  'Apparel',
  'Beauty',
  'Health & Wellness',
  'Food & Beverage',
  'Home & Kitchen',
  'Consumer Electronics',
  'Sports & Outdoors',
  'Pets',
  'Baby & Kids',
  'Jewelry & Accessories',
  'Automotive',
  'Travel',
  'Software / SaaS',
  'Education',
  'Other',
] as const;

export type PrimaryCategory = (typeof TOP_CATEGORIES)[number];

export interface NormalizedCategory {
  primary_category: PrimaryCategory;
  subcategory: string | null;
  confidence: 'Low' | 'Medium' | 'High';
}

// Keyword → top-level mapping. Order matters only for readability; we score all.
// Each keyword is matched as a whole-ish token against the lowercased raw string.
const RULES: { cat: PrimaryCategory; keywords: string[] }[] = [
  { cat: 'Apparel', keywords: ['apparel', 'clothing', 'fashion', 'shoe', 'footwear', 'shirt', 'dress', 'denim', 'outerwear', 'lingerie', 'underwear', 'activewear', 'swimwear', 'hat', 'sock', 'wardrobe', 'menswear', 'womenswear'] },
  { cat: 'Beauty', keywords: ['beauty', 'cosmetic', 'makeup', 'skincare', 'skin care', 'haircare', 'hair care', 'fragrance', 'perfume', 'nail', 'salon', 'grooming', 'lipstick', 'serum'] },
  { cat: 'Health & Wellness', keywords: ['health', 'wellness', 'supplement', 'vitamin', 'nutrition', 'fitness', 'medical', 'pharmacy', 'cbd', 'protein', 'wellbeing', 'personal care', 'sexual wellness', 'mental'] },
  { cat: 'Food & Beverage', keywords: ['food', 'beverage', 'drink', 'grocery', 'coffee', 'tea', 'snack', 'candy', 'chocolate', 'wine', 'spirits', 'alcohol', 'gourmet', 'bakery', 'meal', 'seasoning', 'sauce'] },
  { cat: 'Home & Kitchen', keywords: ['home', 'kitchen', 'furniture', 'decor', 'bedding', 'bath', 'garden', 'cookware', 'appliance', 'mattress', 'lighting', 'cleaning', 'household', 'candle', 'rug', 'storage'] },
  { cat: 'Consumer Electronics', keywords: ['electronic', 'electronics', 'gadget', 'computer', 'phone', 'audio', 'headphone', 'camera', 'tech', 'accessories for electronics', 'charger', 'smart home', 'gaming', 'console', 'wearable'] },
  { cat: 'Sports & Outdoors', keywords: ['sport', 'sports', 'outdoor', 'camping', 'hiking', 'cycling', 'bike', 'fishing', 'golf', 'yoga', 'gym', 'athletic', 'fitness equipment', 'hunting', 'ski', 'surf'] },
  { cat: 'Pets', keywords: ['pet', 'pets', 'dog', 'cat', 'animal', 'aquarium', 'veterinary', 'pet supplies'] },
  { cat: 'Baby & Kids', keywords: ['baby', 'babies', 'kids', 'toddler', 'infant', 'children', 'toy', 'toys', 'nursery', 'maternity', 'stroller', 'diaper'] },
  { cat: 'Jewelry & Accessories', keywords: ['jewelry', 'jewellery', 'watch', 'watches', 'ring', 'necklace', 'bracelet', 'earring', 'accessories', 'bag', 'handbag', 'wallet', 'sunglasses', 'eyewear'] },
  { cat: 'Automotive', keywords: ['auto', 'automotive', 'car', 'vehicle', 'motorcycle', 'truck', 'parts', 'tire', 'motor'] },
  { cat: 'Travel', keywords: ['travel', 'luggage', 'suitcase', 'backpack', 'outdoor gear', 'tourism', 'hotel', 'adventure'] },
  { cat: 'Software / SaaS', keywords: ['software', 'saas', 'app', 'platform', 'digital', 'subscription service', 'technology service', 'cloud'] },
  { cat: 'Education', keywords: ['education', 'learning', 'course', 'school', 'training', 'book', 'books', 'stationery', 'tutoring', 'ebook'] },
];

function splitRaw(raw: string): string[] {
  // Handles "/A/B", "A > B", "A | B", "A, B", "A/B".
  return raw
    .split(/[/>|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeCategory(raw: string | null | undefined): NormalizedCategory {
  if (!raw || !raw.trim()) {
    return { primary_category: 'Other', subcategory: null, confidence: 'Low' };
  }
  const segments = splitRaw(raw);
  const hay = raw.toLowerCase();

  // Score each top-level category by keyword hits, weighting earlier segments.
  const scores = new Map<PrimaryCategory, number>();
  for (const { cat, keywords } of RULES) {
    let score = 0;
    for (const kw of keywords) {
      if (hay.includes(kw)) {
        score += 1;
        // Bonus if the keyword appears in the first segment (the broad bucket).
        if (segments[0] && segments[0].toLowerCase().includes(kw)) score += 1.5;
      }
    }
    if (score > 0) scores.set(cat, score);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return { primary_category: 'Other', subcategory: segments[0] ?? null, confidence: 'Low' };
  }

  const [primary, topScore] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  // Subcategory: the most specific segment that isn't the matched primary name.
  const subcategory =
    segments.find((s) => s.toLowerCase() !== primary.toLowerCase()) ??
    (segments.length > 1 ? segments[segments.length - 1] : null);

  // Confidence: strong & unambiguous winner = High; clear winner = Medium.
  let confidence: NormalizedCategory['confidence'] = 'Medium';
  if (topScore >= 2.5 && topScore > second * 1.5) confidence = 'High';
  else if (topScore <= 1 && ranked.length > 1) confidence = 'Low';

  return { primary_category: primary, subcategory: subcategory || null, confidence };
}
