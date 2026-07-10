// "Why this account is interesting" — one scannable sentence per account,
// built only from signals we actually have. This is the column that makes a
// TAM list feel like intelligence instead of a spreadsheet.

import type { SpendEstimate } from './adSpend.ts';

export interface ReasonInputs {
  metaAds?: number | null;
  metaChangePct?: number | null; // vs last tracked, when history exists
  creativeDiversityScore?: number | null; // 0-100
  realCreativeScore?: number | null; // 0-100
  dpaShare?: number | null; // 0-1
  momentum?: string | null;
  growthScore?: number | null;
  spend?: SpendEstimate | null;
  landingPages?: number | null;
}

export function buildReason(i: ReasonInputs): string {
  const parts: string[] = [];

  if (i.metaChangePct != null && Math.abs(i.metaChangePct) >= 10) {
    parts.push(`Meta ads ${i.metaChangePct > 0 ? 'up' : 'down'} ${Math.abs(i.metaChangePct)}% since last tracked`);
  } else if ((i.metaAds ?? 0) >= 50) {
    parts.push(`${i.metaAds} active Meta ads`);
  } else if ((i.metaAds ?? 0) >= 10) {
    parts.push(`${i.metaAds} active Meta ads — active paid motion`);
  }

  if (i.realCreativeScore != null && i.realCreativeScore >= 55) {
    parts.push('high creative diversity');
  } else if (i.dpaShare != null && i.dpaShare >= 0.5 && (i.metaAds ?? 0) >= 25) {
    parts.push('catalog-heavy ad mix');
  } else if ((i.landingPages ?? 0) >= 8) {
    parts.push(`${i.landingPages} campaign landing pages`);
  }

  if (i.spend) parts.push(`est. ${i.spend.label}/mo spend`);

  if (i.momentum === 'Exploding' || i.momentum === 'Accelerating') {
    parts.push(`${i.momentum.toLowerCase()} momentum`);
  } else if (i.momentum === 'Scaling') {
    parts.push('scaling steadily');
  }

  if (parts.length === 0) {
    if ((i.growthScore ?? 0) >= 40) return `Growth score ${i.growthScore} — early positive signals.`;
    return 'Tracked account — signals still building.';
  }

  const s = parts.slice(0, 3).join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

/** Short outbound angle for copy-to-clipboard. */
export function buildOutboundAngle(name: string, i: ReasonInputs): string {
  const meta = i.metaAds ?? 0;
  if (i.metaChangePct != null && i.metaChangePct >= 15) {
    return `Noticed ${name} scaled Meta ads ${i.metaChangePct}% recently${i.spend ? ` (est. ${i.spend.label}/mo)` : ''} — at that pace, knowing which campaigns are truly incremental decides whether the extra budget compounds or leaks.`;
  }
  if (meta >= 50) {
    return `${name} is running ${meta} active Meta ads${i.spend ? ` with est. ${i.spend.label}/mo behind them` : ''} — at that volume, creative and measurement discipline is usually the difference between scaling and plateauing.`;
  }
  if (meta > 0) {
    return `${name} has ${meta} active Meta ads — early paid investment is exactly when building a measurable acquisition engine pays off most.`;
  }
  return `${name} shows ${i.momentum?.toLowerCase() || 'building'} growth signals — worth a conversation before their paid motion (and vendor stack) locks in.`;
}
