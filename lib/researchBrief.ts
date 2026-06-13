import type { Momentum } from './intelligence';
import { getLens } from './lenses';

export interface ResearchBriefInput {
  brandName: string;
  domain: string;
  category: string | null;
  location: string | null;
  revenueRange: string;
  revenueConfidence: string;
  momentum: Momentum;
  paidIntensity: string;
  metaAds: number;
  googleAds: number;
  linkedinAds: number;
  landingPages: string[];
  campaignThemes: string[];
  sampleAdCopy: string[];
  positioning: string | null; // hero subheadline / meta description
  techStack: { name: string; category: string }[];
  serverSide: string[];
  websiteSignals: {
    subscription: boolean;
    affiliate_program: boolean;
    retail_presence: boolean;
    international: boolean;
    careers_active: boolean;
    careers_roles: string[];
  } | null;
}

function productHints(landingPages: string[], copy: string[]): string[] {
  const text = (landingPages.join(' ') + ' ' + copy.join(' ')).toLowerCase();
  const hints: { kw: RegExp; label: string }[] = [
    { kw: /\bwallets?\b|card-?holder/, label: 'wallets / card holders' },
    { kw: /\brings?\b/, label: 'rings' },
    { kw: /\bchains?\b|necklace|jewelry/, label: 'jewelry' },
    { kw: /\bchargers?\b|magsafe|power\s?bank|\bbattery\b/, label: 'chargers / power' },
    { kw: /cookware|\bpots?\b|\bpans?\b|kitchenware|cast iron|nonstick|\bknives\b|\bknife\b/, label: 'cookware / kitchen' },
    { kw: /\bbags?\b|backpack|\btote\b/, label: 'bags' },
    { kw: /\bbottles?\b|tumbler|hydration/, label: 'drinkware' },
    { kw: /supplement|vitamin|\bgreens\b|protein\s?powder/, label: 'supplements' },
    { kw: /skincare|\bserum\b|moisturiz|\bbeauty\b/, label: 'skincare / beauty' },
    { kw: /\bapparel\b|\btees?\b|t-?shirts?|hoodie|\bclothing\b/, label: 'apparel' },
    { kw: /\bshoes?\b|sneaker|footwear/, label: 'footwear' },
    { kw: /\bgift(s|ing)?\b/, label: 'gifting bundles' },
  ];
  const out: string[] = [];
  for (const h of hints) if (h.kw.test(text) && !out.includes(h.label)) out.push(h.label);
  return out.slice(0, 5);
}

const MOMENTUM_PROSE: Record<Momentum, string> = {
  Dormant: 'shows little active paid investment right now',
  Emerging: 'is in an early, building phase of paid growth',
  Scaling: 'is in an active scaling phase',
  Accelerating: 'is accelerating hard across paid channels',
  Exploding: 'is in an aggressive, full-throttle growth phase',
};

/**
 * Deterministic, analyst-style research brief built from the enriched data.
 * Reads like a human wrote it — not generic AI sales copy.
 */
export function buildResearchBrief(i: ResearchBriefInput, lensId?: string | null): string {
  const lens = getLens(lensId);
  const L: string[] = [];
  const activePlatforms: string[] = [];
  if (i.metaAds > 0) activePlatforms.push(`Meta (${i.metaAds})`);
  if (i.googleAds > 0) activePlatforms.push(`Google (${i.googleAds})`);
  if (i.linkedinAds > 0) activePlatforms.push(`LinkedIn (${i.linkedinAds})`);
  const products = productHints(i.landingPages, i.sampleAdCopy);
  const measurement = i.techStack.filter((t) => t.category === 'Measurement').map((t) => t.name);
  const lifecycle = i.techStack.filter((t) => t.category === 'Lifecycle').map((t) => t.name);
  const dedicatedMmm = measurement.filter((m) => !['GA4', 'Google Tag Manager'].includes(m));

  // 1. Business Overview
  L.push('## Business Overview');
  L.push(
    `${i.brandName} (${i.domain}) is a ${i.category ?? 'consumer'} brand${
      i.location ? ` based in ${i.location}` : ''
    }, with estimated revenue in the ${i.revenueRange} range (${i.revenueConfidence.toLowerCase()} confidence).${
      i.positioning ? ` They position themselves around "${i.positioning.replace(/"/g, '').slice(0, 160)}."` : ''
    } On current signals the business ${MOMENTUM_PROSE[i.momentum]} (momentum: ${i.momentum}).`
  );

  // 2. Products being pushed
  L.push('\n## What They Are Pushing');
  if (products.length) {
    L.push(
      `Active ad and landing-page activity centers on ${products.join(', ')}. ${
        i.landingPages.length >= 5
          ? `They run a wide set of dedicated landing pages (${i.landingPages.length}+), suggesting offer- and audience-level testing rather than a single hero funnel.`
          : 'Their funnel is relatively concentrated around a few key pages.'
      }`
    );
  } else {
    L.push('Specific product focus is unclear from current creative, but paid activity is present.');
  }

  // 3. Campaign themes
  if (i.campaignThemes.length) {
    L.push('\n## Active Campaign Themes');
    L.push(i.campaignThemes.map((t) => `- ${t}`).join('\n'));
  }

  // 4. Paid media observations
  L.push('\n## Paid Media Observations');
  if (activePlatforms.length) {
    L.push(
      `Currently advertising on ${activePlatforms.join(', ')} — a ${
        activePlatforms.length >= 2 ? 'multi-channel' : 'single-channel'
      } paid mix at ${i.paidIntensity} intensity.${
        i.metaAds >= 100
          ? ' The high Meta creative volume points to a mature, in-house or agency-run performance team actively testing into scale.'
          : i.metaAds >= 10
            ? ' Meta volume suggests a structured but still-scaling paid program.'
            : ''
      }`
    );
  } else {
    L.push('No active paid campaigns were detected across Meta, Google, or LinkedIn libraries.');
  }

  // 5. Growth observations
  L.push('\n## Growth Observations');
  const growthBits: string[] = [];
  if (i.websiteSignals?.subscription) growthBits.push('a subscription / recurring-revenue motion');
  if (i.websiteSignals?.affiliate_program) growthBits.push('an affiliate / ambassador program');
  if (i.websiteSignals?.retail_presence) growthBits.push('retail / wholesale expansion');
  if (i.websiteSignals?.international) growthBits.push('international expansion');
  if (i.websiteSignals?.careers_active)
    growthBits.push(
      i.websiteSignals.careers_roles.length
        ? `active hiring (${i.websiteSignals.careers_roles.slice(0, 3).join(', ')})`
        : 'active hiring'
    );
  L.push(
    growthBits.length
      ? `Beyond paid, the brand shows ${growthBits.join(', ')} — all consistent with a company investing in durable growth, not just short-term acquisition.`
      : 'Growth appears primarily paid-acquisition driven, with limited additional expansion signals on-site.'
  );
  // Objective stack note (no editorializing).
  const stackBits: string[] = [];
  if (measurement.length) stackBits.push(`${measurement.join(' / ')} for measurement`);
  if (lifecycle.length) stackBits.push(`${lifecycle.join(' / ')} for lifecycle`);
  if (i.serverSide.length) stackBits.push('server-side / CAPI tracking');
  if (stackBits.length) L.push(`Their stack includes ${stackBits.join(', ')}.`);

  // 6. Likely priorities (objective — what the company likely cares about)
  L.push('\n## Likely Priorities');
  const priorities: string[] = [];
  if (i.metaAds >= 50 || i.googleAds >= 25)
    priorities.push('scaling paid spend efficiently while protecting ROAS/MER');
  if (i.landingPages.length >= 5) priorities.push('conversion-rate optimization across many landing pages');
  if (lifecycle.length) priorities.push('lifecycle / retention to improve LTV');
  if (i.websiteSignals?.international) priorities.push('international growth');
  if (activePlatforms.length === 1) priorities.push('diversifying beyond a single paid channel');
  L.push(
    (priorities.length ? priorities : ['establishing a repeatable, measurable acquisition engine'])
      .map((p) => `- ${p}`)
      .join('\n')
  );

  // 7 + 8: lens-driven (framed for what YOU sell).
  L.push('\n## Potential Risks');
  L.push(lens.risks(i).map((r) => `- ${r}`).join('\n'));

  L.push('\n## Recommended Outreach Angle');
  L.push(lens.angle(i));

  return L.join('\n');
}
