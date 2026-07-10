// Persona layer — same signals, different conclusions.
//
// Tambourine is growth intelligence for sellers: agencies, DTC SaaS vendors,
// and 3PLs read the same underlying growth evidence through different lenses.
// Templated (no LLM calls): deterministic, instant, testable.

import type { ReasonInputs } from './reason.ts';
import { buildReason } from './reason.ts';

export type Persona = 'agency' | 'dtc_saas' | '3pl' | 'other';

export const PERSONAS: { id: Persona; label: string; blurb: string }[] = [
  { id: 'agency', label: 'Agency', blurb: 'Paid media, creative, and measurement services' },
  { id: 'dtc_saas', label: 'DTC SaaS', blurb: 'Software sold to ecommerce brands' },
  { id: '3pl', label: '3PL / Logistics', blurb: 'Fulfillment, shipping, and warehousing' },
  { id: 'other', label: 'Other', blurb: 'General growth intelligence' },
];

export function isPersona(v: unknown): v is Persona {
  return v === 'agency' || v === 'dtc_saas' || v === '3pl' || v === 'other';
}

const fmtMomentum = (m?: string | null) => (m ? m.toLowerCase() : 'building');

/**
 * Persona-aware "why this account is interesting" — one scannable sentence.
 * Falls back to the neutral reason for 'other' or when signals are thin.
 */
export function buildPersonaReason(persona: Persona, i: ReasonInputs): string {
  const meta = i.metaAds ?? 0;
  const spend = i.spend?.label ? `est. ${i.spend.label}/yr growth investment` : null;
  const mom = i.momentum;
  const growing = mom === 'Exploding' || mom === 'Accelerating' || mom === 'Scaling';

  if (persona === 'agency') {
    const parts: string[] = [];
    if (i.metaChangePct != null && Math.abs(i.metaChangePct) >= 10) {
      parts.push(`creative volume ${i.metaChangePct > 0 ? 'up' : 'down'} ${Math.abs(i.metaChangePct)}% since last tracked`);
    } else if (meta >= 25) parts.push(`${meta} live creatives in rotation`);
    if (i.realCreativeScore != null && i.realCreativeScore >= 55) parts.push('strong creative testing motion');
    else if (i.dpaShare != null && i.dpaShare >= 0.5 && meta >= 25) parts.push('catalog-heavy mix — creative gap to sell into');
    if (spend) parts.push(spend);
    if (parts.length === 0) return buildReason(i);
    const s = parts.slice(0, 3).join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  if (persona === '3pl') {
    const parts: string[] = [];
    if (growing) parts.push(`${fmtMomentum(mom)} demand — order volume likely rising with it`);
    if ((i.landingPages ?? 0) >= 8) parts.push(`${i.landingPages} active campaign destinations suggest an expanding catalog`);
    if (i.metaChangePct != null && i.metaChangePct >= 15) {
      parts.push(`acquisition push (+${i.metaChangePct}% ad volume) that fulfillment will feel next`);
    } else if (meta >= 50) parts.push('sustained acquisition volume to fulfill');
    if (parts.length === 0) return buildReason(i);
    const s = parts.slice(0, 3).join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  if (persona === 'dtc_saas') {
    const parts: string[] = [];
    if (growing) parts.push(`${fmtMomentum(mom)} growth — evaluating tools while budgets expand`);
    if (meta >= 50 && spend) parts.push(`scaling paid (${spend}) — CAC pressure makes efficiency tooling land`);
    else if (meta >= 10) parts.push('active acquisition motion — stack decisions in play');
    if ((i.landingPages ?? 0) >= 8) parts.push('rapid page/offer iteration');
    if (parts.length === 0) return buildReason(i);
    const s = parts.slice(0, 3).join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  return buildReason(i);
}

/** Persona-aware key takeaways for the Growth Narrative block (2-3 bullets). */
export function buildPersonaTakeaways(persona: Persona, i: ReasonInputs): string[] {
  const out: string[] = [];
  const meta = i.metaAds ?? 0;
  const mom = i.momentum;
  const growing = mom === 'Exploding' || mom === 'Accelerating';

  if (persona === 'agency') {
    if (i.metaChangePct != null && i.metaChangePct >= 10) out.push(`Creative output up ${i.metaChangePct}% since last tracked`);
    if (i.realCreativeScore != null) {
      out.push(i.realCreativeScore >= 55
        ? 'Diverse, hand-built creative — sophisticated buyer, lead with measurement'
        : 'Creative mix skews catalog — pitch creative volume + testing discipline');
    }
    if (i.spend?.label) out.push(`Growth investment ~${i.spend.label}/yr — budget exists`);
  } else if (persona === '3pl') {
    if (growing) out.push('Demand is compounding — fulfillment capacity becomes the bottleneck next');
    if ((i.landingPages ?? 0) >= 8) out.push(`${i.landingPages} campaign destinations → likely SKU/offer expansion`);
    if (meta >= 50) out.push('Sustained acquisition spend means steady order volume, not a spike');
  } else if (persona === 'dtc_saas') {
    if (growing) out.push('Growth phase = active vendor evaluation window');
    if (meta >= 50) out.push('Heavy paid motion → CAC pressure → efficiency tools resonate');
    if (i.realCreativeScore != null && i.realCreativeScore >= 55) out.push('Testing culture — receptive to data/optimization products');
  }
  if (out.length === 0) {
    if (growing) out.push(`Momentum classified as ${mom}`);
    if (meta > 0) out.push(`${meta} active growth campaigns observed`);
    if (out.length === 0) out.push('Signals still building for this account');
  }
  return out.slice(0, 3);
}

/** localStorage helpers (client-side; keyed per user like quota counters). */
export function personaStorageKey(userId: string | null | undefined): string {
  return `${userId ?? 'anon'}:tam_persona`;
}
