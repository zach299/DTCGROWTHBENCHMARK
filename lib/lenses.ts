import type { ResearchBriefInput } from './researchBrief';

export interface Lens {
  id: string;
  label: string;
  // Risks framed for what YOU sell, and the recommended outreach angle + hook.
  risks: (i: ResearchBriefInput) => string[];
  angle: (i: ResearchBriefInput) => string;
  hook: (i: ResearchBriefInput) => string;
}

// ---- shared signal helpers ----
function platforms(i: ResearchBriefInput): string[] {
  const p: string[] = [];
  if (i.metaAds > 0) p.push('Meta');
  if (i.googleAds > 0) p.push('Google');
  if (i.linkedinAds > 0) p.push('LinkedIn');
  return p;
}
function dedicatedMmm(i: ResearchBriefInput): string[] {
  return i.techStack
    .filter((t) => t.category === 'Measurement' && !['GA4', 'Google Tag Manager'].includes(t.name))
    .map((t) => t.name);
}
function lifecycleTools(i: ResearchBriefInput): string[] {
  return i.techStack.filter((t) => t.category === 'Lifecycle').map((t) => t.name);
}
function take<T>(a: T[], n: number): T[] {
  return a.slice(0, n);
}

// ---- lenses ----
const measurement: Lens = {
  id: 'measurement',
  label: 'Measurement & Attribution',
  risks: (i) => {
    const r: string[] = [];
    const mmm = dedicatedMmm(i);
    if (i.metaAds >= 50 && !mmm.length)
      r.push('high paid spend with no dedicated measurement platform — likely attribution blind spots');
    if (platforms(i).length >= 2)
      r.push(`spend split across ${platforms(i).join(', ')} with no unified view — cross-channel attribution is hard to reconcile`);
    if (i.landingPages.length >= 8)
      r.push('funnel sprawl across many landing pages makes true incremental performance hard to read');
    r.push('rising CPMs and signal loss make last-click attribution increasingly unreliable at this scale');
    return take(r, 4);
  },
  angle: (i) => {
    const mmm = dedicatedMmm(i);
    return mmm.length
      ? `They already run ${mmm.join(' and ')}, so lead with displacement/consolidation: accuracy, incrementality, and a single source of truth across ${platforms(i).join(', ') || 'their channels'} — not "do you measure?"`
      : `They spend meaningfully on paid (${platforms(i).join(', ') || 'paid channels'}) but show no dedicated attribution platform — the wedge is helping them see which campaigns are truly incremental before inefficiency compounds.`;
  },
  hook: (i) => {
    const p = platforms(i);
    if (i.metaAds >= 10)
      return `${i.brandName} is running ${i.metaAds} active Meta ads across ${i.landingPages.length} landing pages — at this volume it's hard to see which campaigns are truly incremental.`;
    if (p.length)
      return `${i.brandName} is active on ${p.join(' and ')} — multi-channel spend without unified attribution makes it difficult to measure true incrementality.`;
    return `${i.brandName} is in an ${i.momentum} growth phase — paid media and attribution will be key levers as they scale.`;
  },
};

const emailSms: Lens = {
  id: 'email_sms',
  label: 'Email & SMS / Lifecycle',
  risks: (i) => {
    const r: string[] = [];
    const lc = lifecycleTools(i);
    if (!lc.length)
      r.push('no email/SMS platform detected — likely leaving owned-channel revenue and repeat purchase on the table');
    if (!i.websiteSignals?.subscription)
      r.push('no subscription / recurring motion — heavy reliance on one-time, paid-acquired purchases');
    if (i.metaAds >= 50)
      r.push('high paid dependence without strong retention compounds CAC pressure as CPMs rise');
    return take(r.length ? r : ['retention and LTV are the lever as paid acquisition gets more expensive'], 4);
  },
  angle: (i) => {
    const lc = lifecycleTools(i);
    return lc.length
      ? `They run ${lc.join(' and ')} — the wedge is squeezing more from owned channels (segmentation, deliverability, flows) to lift LTV and reduce paid dependence.`
      : `They acquire hard on paid (${platforms(i).join(', ') || 'paid'}) but show no lifecycle platform — the wedge is capturing owned-channel revenue (email/SMS) to lower effective CAC.`;
  },
  hook: (i) => {
    const p = platforms(i);
    const totalAds = i.metaAds + i.googleAds + i.linkedinAds;
    if (totalAds >= 10)
      return `${i.brandName} is acquiring hard on ${p.join(' and ') || 'paid channels'} — the question is how much of that traffic converts into repeat, owned-channel revenue.`;
    return `${i.brandName} is in a ${i.momentum} phase — early investment in lifecycle will compound as they scale paid acquisition.`;
  },
};

const cro: Lens = {
  id: 'cro',
  label: 'CRO & Landing Pages',
  risks: (i) => {
    const r: string[] = [];
    if (i.landingPages.length >= 8)
      r.push(`funnel sprawl across ${i.landingPages.length} landing pages — hard to keep conversion quality consistent`);
    if (i.metaAds >= 50)
      r.push('high creative volume driving pages with unknown conversion rates risks wasted spend');
    r.push('at this ad volume, small conversion-rate gaps translate into large wasted budget');
    return take(r, 4);
  },
  angle: (i) =>
    `They push ${i.metaAds} ads into ${i.landingPages.length} dedicated landing pages — the wedge is lifting conversion rate and page-test velocity so the same spend yields more revenue.`,
  hook: (i) => {
    if (i.metaAds >= 10)
      return `${i.brandName} is driving ${i.metaAds} ads into ${i.landingPages.length} landing pages — small CVR gains at this volume compound fast.`;
    return `${i.brandName} is in an ${i.momentum} phase — landing page conversion rate will determine how efficiently paid spend scales.`;
  },
};

const paidMedia: Lens = {
  id: 'paid_media',
  label: 'Paid Media / Creative',
  risks: (i) => {
    const r: string[] = [];
    if (platforms(i).length === 1)
      r.push(`concentrated on a single channel (${platforms(i)[0]}) — diversification and creative-fatigue risk`);
    if (i.metaAds >= 50)
      r.push(`sustaining ${i.metaAds} live creatives demands constant fresh production — creative fatigue is a real threat`);
    r.push('rising CPMs mean efficiency depends on creative quality and iteration speed, not budget');
    return take(r, 4);
  },
  angle: (i) =>
    `They're testing at scale (${i.metaAds} Meta ads${i.googleAds ? `, ${i.googleAds} Google` : ''}) — the wedge is creative production/iteration velocity and channel diversification to keep CAC down.`,
  hook: (i) => {
    const p = platforms(i);
    if (i.metaAds >= 10)
      return `${i.brandName} is running ${i.metaAds} active Meta ads — at that volume creative fatigue and CPMs are the constraint, not budget.`;
    if (p.length)
      return `${i.brandName} is active on ${p.join(' and ')} — creative strategy and channel mix will define their cost efficiency as they scale.`;
    return `${i.brandName} is in a ${i.momentum} phase — building a scalable creative and media strategy now prevents efficiency drag later.`;
  },
};

const neutral: Lens = {
  id: 'neutral',
  label: 'Objective (no pitch)',
  risks: (i) => {
    const r: string[] = [];
    if (platforms(i).length === 1) r.push(`concentrated on a single paid channel (${platforms(i)[0]})`);
    if (i.metaAds >= 50) r.push('growth appears heavily paid-acquisition dependent');
    if (i.landingPages.length >= 8) r.push('a wide, sprawling landing-page footprint to manage');
    r.push('rising CPMs and signal loss are an industry-wide headwind at this spend level');
    return take(r, 4);
  },
  angle: (i) =>
    `${i.brandName} is in a ${i.momentum} phase with strong paid investment across ${platforms(i).join(', ') || 'paid channels'}. The clearest leverage points are channel diversification, conversion efficiency, and retention.`,
  hook: (i) => {
    const p = platforms(i);
    if (i.metaAds >= 10)
      return `${i.brandName} is running ${i.metaAds} active Meta ads across ${i.landingPages.length} landing pages.`;
    if (p.length)
      return `${i.brandName} is active on ${p.join(' and ')} and in a ${i.momentum} growth phase.`;
    return `${i.brandName} is in a ${i.momentum} phase — building toward a repeatable acquisition engine.`;
  },
};

export const LENSES: Lens[] = [measurement, emailSms, cro, paidMedia, neutral];

export function getLens(id?: string | null): Lens {
  return LENSES.find((l) => l.id === id) ?? LENSES[0];
}
