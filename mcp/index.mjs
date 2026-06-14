#!/usr/bin/env node
// Growth Signals MCP server — exposes company intelligence, watchlists, and
// top movers to Claude. Returns structured intelligence, never raw JSON.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = (process.env.GROWTH_SIGNALS_API_BASE || 'https://dtcgrowthbenchmark.vercel.app').replace(/\/$/, '');
const EMOJI = { Dormant: '😴', Emerging: '🌱', Scaling: '📈', Accelerating: '🚀', Exploding: '💥' };

async function api(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`API ${path} ${res.status}: ${t.slice(0, 120)}`);
  }
  return res.json();
}

function adCount(platforms, name) {
  const p = (platforms ?? []).find((x) => x.platform === name);
  return p && p.status === 'active' ? p.ads_count ?? 0 : null;
}

// Fetch a company; analyze it if it hasn't been yet, so we always return data.
async function fetchCompany(domain) {
  const c = await api('/api/company', { domain });
  if (c.analysis) return normalize(c.domain, c.company, c.analysis, c.timeline);
  const fresh = await api('/api/analyze-domain', { domain });
  return normalize(fresh.domain, fresh.company, fresh, fresh.timeline);
}

function normalize(domain, company, a, timeline) {
  return {
    domain,
    brand: a.meta_ads?.advertiser_name || (domain || '').replace(/^www\./, '').split('.')[0],
    growth_score: a.growth_score ?? null,
    momentum: a.growth_momentum ?? null,
    revenue_range: a.revenue_range ?? null,
    revenue_confidence: a.revenue_confidence ?? null,
    meta: a.meta_ads?.active_ads_count ?? adCount(a.ad_platforms, 'Meta'),
    google: adCount(a.ad_platforms, 'Google'),
    linkedin: adCount(a.ad_platforms, 'LinkedIn'),
    themes: a.landing_page_signals?.campaign_themes ?? [],
    research_brief: a.research_brief ?? null,
    category: a.primary_category ?? company?.categories ?? null,
    location: company?.company_location ?? null,
    spend_band: a.spend_band ?? null,
    quality: a.paid_media_quality ?? null,
    timeline: timeline ?? [],
  };
}

function recommendation(score, momentum) {
  if (momentum === 'Exploding' || momentum === 'Accelerating' || (score ?? 0) >= 90)
    return 'High-priority account.';
  if (momentum === 'Scaling' || (score ?? 0) >= 70) return 'Worth prioritizing — solid growth signals.';
  if (momentum === 'Emerging') return 'Emerging — keep on the radar.';
  return 'Low urgency right now.';
}

function formatCompany(n) {
  const platforms = [];
  if (n.meta != null) platforms.push(`- Meta: ${n.meta} active ads`);
  if (n.google != null) platforms.push(`- Google: ${n.google} active ads`);
  if (n.linkedin != null) platforms.push(`- LinkedIn: ${n.linkedin} active ads`);
  const signals = [];
  if ((n.meta ?? 0) >= 100) signals.push('High Meta ad activity');
  if ((n.google ?? 0) > 0) signals.push('Active on Google');
  if (n.themes.length) signals.push(`Campaign themes: ${n.themes.slice(0, 4).join(', ')}`);
  const lines = [
    `${n.brand} (${n.domain})`,
    `Growth Score: ${n.growth_score ?? '—'}`,
    `Growth Momentum: ${n.momentum ?? '—'} ${n.momentum ? EMOJI[n.momentum] || '' : ''}`.trim(),
    `Est. Revenue: ${n.revenue_range ?? '—'}${n.revenue_confidence ? ` (${n.revenue_confidence} confidence)` : ''}`,
    '',
    'Ad Activity:',
    ...(platforms.length ? platforms : ['- No active paid campaigns detected']),
  ];
  if (n.quality && n.quality.real_creative_score != null) {
    const dpaPct = Math.round((n.quality.dpa_share ?? 0) * 100);
    signals.push(
      `Real Creative Score ${n.quality.real_creative_score}/100 (${n.quality.unique_creative_count} unique creatives, ${n.quality.campaign_angle_count} angles, ${dpaPct}% catalog/DPA)`
    );
  }
  if (n.spend_band) signals.push(`Est. paid spend: ${n.spend_band}`);
  if (signals.length) {
    lines.push('', 'Recent Signals:', ...signals.map((s) => `- ${s}`));
  }
  lines.push('', `Recommendation: ${recommendation(n.growth_score, n.momentum)}`);
  return lines.join('\n');
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });

const server = new McpServer({ name: 'growth-signals', version: '1.0.0' });

// Fetch the full ranking picture (overall + category + channel benchmarks).
async function fetchRank(n) {
  try {
    return await api('/api/rank', {
      domain: n.domain,
      active_meta_ads: n.meta ?? 0,
      google_ads: n.google ?? 0,
      linkedin_ads: n.linkedin ?? 0,
    });
  } catch {
    return null;
  }
}

function formatRank(r) {
  if (!r) return '';
  const lines = ['', '--- Rankings ---'];
  if (r.rank != null) lines.push(`Overall Growth Rank: #${r.rank} of ${r.total}${r.percentile_top ? ` (Top ${r.percentile_top}%)` : ''}`);
  if (r.category_rank != null) lines.push(`${r.primary_category} Rank: #${r.category_rank} of ${r.category_total}${r.category_percentile_top ? ` (Top ${r.category_percentile_top}%)` : ''}`);
  for (const c of r.channels ?? []) {
    if (c.ads > 0) lines.push(`${c.channel}: ${c.ads} ads — ${c.overall_label} overall, ${c.category_label} in ${r.primary_category ?? 'category'}`);
    else lines.push(`${c.channel}: 0 ads — Below median`);
  }
  return lines.join('\n');
}

server.tool(
  'get_company',
  'Get the full growth intelligence for a company by domain (e.g. ridge.com), including Growth Rank, Category Rank, channel benchmarks and modeled revenue. Analyzes it if not already in the database.',
  { domain: z.string().describe('Company domain, e.g. ridge.com') },
  async ({ domain }) => {
    try {
      const n = await fetchCompany(domain);
      const rank = await fetchRank(n);
      const brief = n.research_brief ? `\n\n--- Research Brief ---\n${n.research_brief}` : '';
      return text(formatCompany(n) + formatRank(rank) + brief);
    } catch (e) {
      return text(`Could not analyze ${domain}: ${e.message}`);
    }
  }
);

// --- Discovery tools backed by the enriched dataset (top-movers + benchmarks). ---

function fmtMover(m, i) {
  const parts = [`${i + 1}. ${m.company_name || m.domain} (${m.domain})`];
  if (m.primary_category) parts.push(`[${m.primary_category}]`);
  parts.push(`— ${m.growth_momentum ?? '—'} ${EMOJI[m.growth_momentum] || ''}`.trim());
  parts.push(`Meta ${m.active_meta_ads}, Google ${m.google_ads}, LinkedIn ${m.linkedin_ads}`);
  if (m.estimated_revenue_range) parts.push(`Rev ${m.estimated_revenue_range}`);
  if (m.percentile_top != null) parts.push(`Top ${m.percentile_top}%`);
  return parts.join(' ');
}

server.tool(
  'find_companies',
  'Find/segment companies from the enriched dataset. Answers questions like "top 1% in Meta ads", "which Beauty brands are accelerating", "high Meta but low Google", "who should I prioritize this week". Filters combine.',
  {
    category: z.string().optional().describe('Primary category, e.g. Beauty, Apparel, Health & Wellness'),
    channel: z.enum(['Meta', 'Google', 'LinkedIn']).optional().describe('Rank by this channel\'s active ads'),
    momentum: z.enum(['Scaling', 'Accelerating', 'Exploding']).optional().describe('Minimum momentum tier'),
    max_percentile_top: z.number().optional().describe('Only companies in at least this top percentile, e.g. 1 = Top 1%'),
    high_meta_low_google: z.boolean().optional().describe('Companies with strong Meta but little/no Google presence'),
    limit: z.number().optional(),
  },
  async ({ category, channel, momentum, max_percentile_top, high_meta_low_google, limit }) => {
    try {
      const data = await api('/api/top-movers');
      let rows = data.movers ?? [];
      if (category) rows = rows.filter((m) => (m.primary_category || '').toLowerCase() === category.toLowerCase());
      const order = { Scaling: 1, Accelerating: 2, Exploding: 3 };
      if (momentum) rows = rows.filter((m) => (order[m.growth_momentum] ?? 0) >= order[momentum]);
      if (max_percentile_top != null) rows = rows.filter((m) => m.percentile_top != null && m.percentile_top <= max_percentile_top);
      if (high_meta_low_google) rows = rows.filter((m) => m.active_meta_ads >= 20 && m.google_ads <= 2);
      if (channel) {
        const key = channel === 'Meta' ? 'active_meta_ads' : channel === 'Google' ? 'google_ads' : 'linkedin_ads';
        rows = rows.filter((m) => m[key] > 0).sort((a, b) => b[key] - a[key]);
      }
      rows = rows.slice(0, limit ?? 15);
      if (!rows.length) return text('No companies match those criteria yet.');
      const header = [category && `category=${category}`, channel && `channel=${channel}`, momentum && `momentum>=${momentum}`, max_percentile_top && `Top ${max_percentile_top}%`, high_meta_low_google && 'high Meta / low Google'].filter(Boolean).join(', ');
      return text(`Companies${header ? ` (${header})` : ''}:\n` + rows.map(fmtMover).join('\n'));
    } catch (e) {
      return text(`Find failed: ${e.message}`);
    }
  }
);

server.tool(
  'get_category_benchmarks',
  'Show peer benchmarks for a category (median Meta/Google/LinkedIn ads, Top 10%/Top 1% Meta thresholds, average growth score). Omit category to list all.',
  { category: z.string().optional() },
  async ({ category }) => {
    try {
      const { categories } = await api('/api/benchmarks');
      let rows = categories ?? [];
      if (category) rows = rows.filter((c) => c.primary_category.toLowerCase() === category.toLowerCase());
      if (!rows.length) return text('No benchmark data yet.');
      return text(
        rows
          .map(
            (c) =>
              `${c.primary_category} (${c.count} brands)\n  Median ads — Meta ${c.median_meta_ads}, Google ${c.median_google_ads}, LinkedIn ${c.median_linkedin_ads}\n  Meta thresholds — Top 10%: ${c.meta_top10_threshold}, Top 1%: ${c.meta_top1_threshold}\n  Avg Growth Score: ${c.avg_growth_score}`
          )
          .join('\n\n')
      );
    } catch (e) {
      return text(`Benchmarks failed: ${e.message}`);
    }
  }
);

server.tool(
  'search_companies',
  'Search the company database by name or domain substring.',
  { query: z.string().describe('Search term, e.g. "ridge" or "supplement"') },
  async ({ query }) => {
    try {
      const { results } = await api('/api/search', { query });
      if (!results.length) return text(`No companies match "${query}".`);
      return text(
        `Matches for "${query}":\n` +
          results.map((r) => `- ${r.domain}${r.categories ? ` (${r.categories.replace(/^\//, '')})` : ''}`).join('\n')
      );
    } catch (e) {
      return text(`Search failed: ${e.message}`);
    }
  }
);

server.tool(
  'compare_companies',
  'Compare two or more companies side by side on growth signals.',
  { domains: z.array(z.string()).min(2).describe('Domains to compare, e.g. ["ridge.com","drinkag1.com"]') },
  async ({ domains }) => {
    try {
      const ns = await Promise.all(domains.map((d) => fetchCompany(d).catch(() => null)));
      const rows = ns.filter(Boolean);
      if (!rows.length) return text('Could not analyze any of those companies.');
      const out = rows
        .map(
          (n) =>
            `${n.brand} (${n.domain})\n  Growth Score: ${n.growth_score ?? '—'} | Momentum: ${n.momentum ?? '—'} | Revenue: ${n.revenue_range ?? '—'}\n  Meta: ${n.meta ?? '—'} | Google: ${n.google ?? '—'} | LinkedIn: ${n.linkedin ?? '—'}`
        )
        .join('\n\n');
      const top = [...rows].sort((a, b) => (b.growth_score ?? 0) - (a.growth_score ?? 0))[0];
      return text(`${out}\n\nStrongest growth signal: ${top.brand}.`);
    } catch (e) {
      return text(`Compare failed: ${e.message}`);
    }
  }
);

server.tool(
  'get_growth_timeline',
  'Show how a company\'s ad activity and growth have changed over time.',
  { domain: z.string() },
  async ({ domain }) => {
    try {
      const n = await fetchCompany(domain);
      if (!n.timeline.length) return text(`${n.brand}: no historical snapshots yet.`);
      const rows = n.timeline.map(
        (e) =>
          `${e.date}: Meta ${e.active_meta_ads}${e.meta_change_pct != null ? ` (${e.meta_change_pct >= 0 ? '+' : ''}${e.meta_change_pct}%)` : ''}, Google ${e.active_google_ads}, Score ${e.growth_score}${e.growth_momentum ? `, ${e.growth_momentum}` : ''}`
      );
      return text(`Growth timeline for ${n.brand}:\n` + rows.join('\n'));
    } catch (e) {
      return text(`Timeline failed: ${e.message}`);
    }
  }
);

server.tool(
  'get_watchlist',
  'List saved companies, optionally filtered by list, minimum growth score, or momentum.',
  {
    list: z.enum(['Prospects', 'Clients', 'Competitors']).optional(),
    min_score: z.number().optional().describe('Only companies with growth score >= this'),
    momentum: z.enum(['Dormant', 'Emerging', 'Scaling', 'Accelerating', 'Exploding']).optional(),
  },
  async ({ list, min_score, momentum }) => {
    try {
      const { items } = await api('/api/watchlist');
      let rows = items;
      if (list) rows = rows.filter((i) => i.list_name === list);
      if (min_score != null) rows = rows.filter((i) => Number(i.latest?.growth_score ?? 0) >= min_score);
      if (momentum) rows = rows.filter((i) => i.latest?.growth_momentum === momentum);
      if (!rows.length) return text('No saved companies match those criteria.');
      return text(
        rows
          .map(
            (i) =>
              `- ${i.brand_name || i.domain} [${i.list_name}] — Score ${i.latest?.growth_score ?? '—'}, ${i.latest?.growth_momentum ?? 'not analyzed'} ${EMOJI[i.latest?.growth_momentum] || ''}, Meta ${i.latest?.active_meta_ads ?? '—'} ads`.trim()
          )
          .join('\n')
      );
    } catch (e) {
      return text(`Watchlist failed: ${e.message}`);
    }
  }
);

server.tool(
  'get_top_movers',
  'Rank analyzed companies by growth momentum, growth score, and ad growth.',
  { limit: z.number().optional() },
  async ({ limit }) => {
    try {
      const { movers } = await api('/api/top-movers');
      const rows = movers.slice(0, limit ?? 15);
      if (!rows.length) return text('No companies analyzed yet.');
      return text('Top movers (fastest growing):\n' + rows.map(fmtMover).join('\n'));
    } catch (e) {
      return text(`Top movers failed: ${e.message}`);
    }
  }
);

await server.connect(new StdioServerTransport());
