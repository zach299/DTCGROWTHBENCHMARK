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
    category: company?.categories ?? null,
    location: company?.company_location ?? null,
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
  if (signals.length) {
    lines.push('', 'Recent Signals:', ...signals.map((s) => `- ${s}`));
  }
  lines.push('', `Recommendation: ${recommendation(n.growth_score, n.momentum)}`);
  return lines.join('\n');
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });

const server = new McpServer({ name: 'growth-signals', version: '1.0.0' });

server.tool(
  'get_company',
  'Get the full growth intelligence for a company by domain (e.g. ridge.com). Analyzes it if not already in the database.',
  { domain: z.string().describe('Company domain, e.g. ridge.com') },
  async ({ domain }) => {
    try {
      const n = await fetchCompany(domain);
      const brief = n.research_brief ? `\n\n--- Research Brief ---\n${n.research_brief}` : '';
      return text(formatCompany(n) + brief);
    } catch (e) {
      return text(`Could not analyze ${domain}: ${e.message}`);
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
      return text(
        'Top movers:\n' +
          rows
            .map(
              (m, i) =>
                `${i + 1}. ${m.domain} — ${m.growth_momentum ?? '—'} ${EMOJI[m.growth_momentum] || ''}, Score ${m.growth_score}, Meta ${m.active_meta_ads} ads${m.ad_growth_pct != null ? ` (${m.ad_growth_pct >= 0 ? '+' : ''}${m.ad_growth_pct}%)` : ''}`.trim()
            )
            .join('\n')
      );
    } catch (e) {
      return text(`Top movers failed: ${e.message}`);
    }
  }
);

await server.connect(new StdioServerTransport());
