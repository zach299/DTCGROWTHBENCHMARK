// Hiring signals via PUBLIC ATS APIs — no scraping, no tokens.
//
// Greenhouse, Lever, Ashby, and Recruitee all expose unauthenticated JSON
// job boards. Resolution: fetch the brand's homepage, look for ATS links (the
// reliable path), and fall back to probing the domain stem as a board slug.
// Coverage is partial by design (~40-60% of brands with public boards);
// brands without a resolvable board are marked checked-with-none so we don't
// re-probe every night.

import { logger } from '../utils/logger.ts';

export type AtsProvider = 'greenhouse' | 'lever' | 'ashby' | 'recruitee';

export interface JobPosting {
  title: string;
  department: string | null;
  location: string | null;
}

export interface HiringSignals {
  provider: AtsProvider | null;
  slug: string | null;
  open_roles: number;
  growth_roles: number;
  ops_roles: number;
  titles_sample: string[]; // up to 12, for narrative use
}

const FETCH_TIMEOUT = 8_000;
const MAX_BODY = 600_000; // homepage HTML cap

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TambourineBot/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, MAX_BODY);
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; TambourineBot/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── ATS link detection in homepage/careers HTML ──────────────────────────────
const ATS_LINK_PATTERNS: { provider: AtsProvider; re: RegExp }[] = [
  { provider: 'greenhouse', re: /boards\.greenhouse\.io\/([a-z0-9-]+)/i },
  { provider: 'greenhouse', re: /job-boards\.greenhouse\.io\/([a-z0-9-]+)/i },
  { provider: 'lever', re: /jobs\.lever\.co\/([a-z0-9-]+)/i },
  { provider: 'ashby', re: /jobs\.ashbyhq\.com\/([a-z0-9-]+)/i },
  { provider: 'recruitee', re: /([a-z0-9-]+)\.recruitee\.com/i },
];

export function detectAtsInHtml(html: string): { provider: AtsProvider; slug: string } | null {
  for (const { provider, re } of ATS_LINK_PATTERNS) {
    const m = html.match(re);
    if (m && m[1] && m[1] !== 'www') return { provider, slug: m[1].toLowerCase() };
  }
  return null;
}

// ── Public board fetchers (normalize to JobPosting[]) ────────────────────────
type J = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : null);

export async function fetchBoard(provider: AtsProvider, slug: string): Promise<JobPosting[] | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  if (provider === 'greenhouse') {
    const d = (await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)) as J | null;
    if (!d || !Array.isArray(d.jobs)) return null;
    return (d.jobs as J[]).map((j) => ({
      title: s(j.title) ?? '',
      department: null,
      location: s((j.location as J | undefined)?.name) ?? null,
    }));
  }
  if (provider === 'lever') {
    const d = await fetchJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    if (!Array.isArray(d)) return null;
    return (d as J[]).map((j) => ({
      title: s(j.text) ?? '',
      department: s((j.categories as J | undefined)?.team) ?? null,
      location: s((j.categories as J | undefined)?.location) ?? null,
    }));
  }
  if (provider === 'ashby') {
    const d = (await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false`
    )) as J | null;
    if (!d || !Array.isArray(d.jobs)) return null;
    return (d.jobs as J[]).map((j) => ({
      title: s(j.title) ?? '',
      department: s(j.department) ?? null,
      location: s(j.location) ?? null,
    }));
  }
  // recruitee
  const d = (await fetchJson(`https://${slug}.recruitee.com/api/offers/`)) as J | null;
  if (!d || !Array.isArray(d.offers)) return null;
  return (d.offers as J[]).map((j) => ({
    title: s(j.title) ?? '',
    department: s(j.department) ?? null,
    location: s(j.location) ?? null,
  }));
}

// ── Role classification ──────────────────────────────────────────────────────
const GROWTH_RE = /\b(growth|marketing|performance|paid (media|social|search)|acquisition|ecommerce manager|crm|retention|lifecycle|brand manager|social media|influencer|affiliate|media buyer|demand gen)\b/i;
const OPS_RE = /\b(warehouse|fulfillment|logistics|supply chain|operations|shipping|inventory|distribution|procurement|3pl|dc associate|picker|packer)\b/i;

export function classifyRoles(postings: JobPosting[]): { growth: number; ops: number } {
  let growth = 0;
  let ops = 0;
  for (const p of postings) {
    const hay = `${p.title} ${p.department ?? ''}`;
    if (GROWTH_RE.test(hay)) growth++;
    if (OPS_RE.test(hay)) ops++;
  }
  return { growth, ops };
}

// ── Full resolution pipeline for one domain ──────────────────────────────────
export async function fetchHiringSignals(
  domain: string,
  knownProvider?: string | null,
  knownSlug?: string | null
): Promise<HiringSignals> {
  const none: HiringSignals = {
    provider: null, slug: null, open_roles: 0, growth_roles: 0, ops_roles: 0, titles_sample: [],
  };
  try {
    // 1. Reuse a previously-resolved board.
    let resolved: { provider: AtsProvider; slug: string } | null = null;
    if (knownProvider && knownSlug && ['greenhouse', 'lever', 'ashby', 'recruitee'].includes(knownProvider)) {
      resolved = { provider: knownProvider as AtsProvider, slug: knownSlug };
    }

    // 2. Detect from homepage HTML (careers links usually live in the footer).
    if (!resolved) {
      const html = await fetchText(`https://${domain}`);
      if (html) {
        resolved = detectAtsInHtml(html);
        // Follow an explicit careers/jobs link one hop if nothing inline.
        if (!resolved) {
          const careers = html.match(/href="([^"]*(?:careers|jobs)[^"]*)"/i)?.[1];
          if (careers && !careers.startsWith('mailto:')) {
            const url = careers.startsWith('http') ? careers : `https://${domain}${careers.startsWith('/') ? '' : '/'}${careers}`;
            const careersHtml = await fetchText(url);
            if (careersHtml) resolved = detectAtsInHtml(careersHtml);
          }
        }
      }
    }

    // 3. Last resort: probe the domain stem as a slug on the two biggest ATSs.
    if (!resolved) {
      const stem = domain.split('.')[0].replace(/[^a-z0-9-]/g, '');
      if (stem.length >= 3) {
        for (const provider of ['greenhouse', 'lever'] as AtsProvider[]) {
          const jobs = await fetchBoard(provider, stem);
          if (jobs && jobs.length > 0) {
            resolved = { provider, slug: stem };
            break;
          }
        }
      }
    }

    if (!resolved) return none;
    const postings = (await fetchBoard(resolved.provider, resolved.slug)) ?? [];
    const { growth, ops } = classifyRoles(postings);
    return {
      provider: resolved.provider,
      slug: resolved.slug,
      open_roles: postings.length,
      growth_roles: growth,
      ops_roles: ops,
      titles_sample: postings.slice(0, 12).map((p) => p.title).filter(Boolean),
    };
  } catch (err) {
    logger.error('hiring signals failed', {
      domain,
      error: err instanceof Error ? err.message : String(err),
    });
    return none;
  }
}
