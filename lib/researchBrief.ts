import type { Momentum } from './intelligence';

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
    { kw: /wallet|card-?holder/, label: 'wallets / card holders' },
    { kw: /\brings?\b/, label: 'rings' },
    { kw: /chain|necklace|jewelry/, label: 'jewelry' },
    { kw: /charger|magsafe|power|battery/, label: 'chargers / power' },
    { kw: /bag|backpack|tote/, label: 'bags' },
    { kw: /bottle|tumbler|hydration/, label: 'drinkware' },
    { kw: /supplement|vitamin|powder|greens/, label: 'supplements' },
    { kw: /skin|serum|cream|beauty/, label: 'skincare / beauty' },
    { kw: /apparel|tee|shirt|hoodie|clothing/, label: 'apparel' },
    { kw: /shoe|sneaker|footwear/, label: 'footwear' },
    { kw: /gift|gifting/, label: 'gifting bundles' },
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
export function buildResearchBrief(i: ResearchBriefInput): string {
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
  if (dedicatedMmm.length) {
    L.push(
      `Their measurement stack already includes ${dedicatedMmm.join(' and ')}${
        i.serverSide.length ? ', plus server-side / CAPI infrastructure' : ''
      } — they clearly value attribution and are willing to invest in it.`
    );
  } else if (i.serverSide.length) {
    L.push('There are signs of server-side conversion tracking, indicating measurement maturity.');
  }

  // 6. Likely priorities
  L.push('\n## Likely Priorities');
  const priorities: string[] = [];
  if (i.metaAds >= 50 || i.googleAds >= 25)
    priorities.push('scaling paid spend efficiently while protecting ROAS/MER');
  if (i.landingPages.length >= 5) priorities.push('conversion-rate optimization across many landing pages');
  if (dedicatedMmm.length || i.serverSide.length)
    priorities.push('accuracy and consolidation of measurement across channels');
  if (lifecycle.length) priorities.push('lifecycle / retention to improve LTV');
  if (i.websiteSignals?.international) priorities.push('international growth');
  L.push(
    (priorities.length ? priorities : ['establishing a repeatable, measurable acquisition engine'])
      .map((p) => `- ${p}`)
      .join('\n')
  );

  // 7. Potential risks
  L.push('\n## Potential Risks');
  const risks: string[] = [];
  if (i.metaAds >= 100 && activePlatforms.length === 1)
    risks.push('heavy concentration on a single platform (Meta) — diversification and incrementality risk');
  if (i.metaAds >= 50 && !dedicatedMmm.length)
    risks.push('high spend with no dedicated measurement platform — attribution blind spots');
  if (i.landingPages.length >= 8)
    risks.push('funnel sprawl across many pages can make true incremental performance hard to read');
  risks.push('rising CPMs and signal loss make last-click attribution increasingly unreliable at this scale');
  L.push(risks.slice(0, 4).map((r) => `- ${r}`).join('\n'));

  // 8. Recommended outreach angle
  L.push('\n## Recommended Outreach Angle');
  L.push(
    dedicatedMmm.length
      ? `Lead with a displacement / consolidation conversation: they already run ${dedicatedMmm.join(' and ')}, so the wedge is accuracy, incrementality, and a single source of truth across ${
          activePlatforms.length >= 2 ? activePlatforms.map((p) => p.split(' ')[0]).join(', ') : 'their channels'
        } — not "do you measure?"`
      : `Lead with measurement maturity: they are spending meaningfully on paid (${activePlatforms.join(
          ', '
        ) || 'paid channels'}) but show no dedicated attribution platform — the wedge is helping them see which campaigns are truly incremental before inefficiency compounds.`
  );

  return L.join('\n');
}
