// Growth Signals — Chrome extension popup (premium dark redesign).
// Every lookup runs through /api/extension/lookup, which handles unknown domains
// and returns 7-day cache state. Stale/missing data is enriched automatically.
const DEFAULT_API_BASE = 'https://dtcgrowthbenchmark.vercel.app';
const SKIP_HOSTS = [
  'linkedin.com', 'facebook.com', 'instagram.com', 'google.com', 'x.com',
  'twitter.com', 'youtube.com', 'tiktok.com', 'myshopify.com', 'pinterest.com',
];
const WATCHLISTS = ['Prospects', 'Clients', 'Competitors'];

const MOMENTUM_COLOR = {
  Exploding: 'green', Accelerating: 'green', Scaling: '', Emerging: 'amber', Dormant: 'muted',
};
const MOMENTUM_EMOJI = { Dormant: '😴', Emerging: '🌱', Scaling: '📈', Accelerating: '🚀', Exploding: '💥' };

const el = (id) => document.getElementById(id);
let API_BASE = DEFAULT_API_BASE;
let current = null;

const getApiBase = () =>
  new Promise((res) => chrome.storage.sync.get(['apiBase'], (v) => res((v.apiBase || DEFAULT_API_BASE).replace(/\/$/, ''))));

const detectDomain = () =>
  new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      try {
        const host = new URL(tabs[0].url).hostname.replace(/^www\./, '');
        resolve(SKIP_HOSTS.some((s) => host === s || host.endsWith('.' + s)) ? '' : host);
      } catch {
        resolve('');
      }
    });
  });

function normalize(sig, domain) {
  const s = sig || {};
  return {
    domain: domain || s.domain,
    brand: s.company_name || (domain || s.domain || '').replace(/^www\./, '').split('.')[0],
    category: s.primary_category || null,
    growth_momentum: s.growth_momentum || null,
    growth_score: s.growth_score || null,
    revenue_range: s.estimated_revenue_range || null,
    meta: s.active_meta_ads ?? null,
    google: s.google_ads ?? 0,
    linkedin: s.linkedin_ads ?? 0,
    real_creative_score: s.real_creative_score ?? null,
    dpa_share: s.dpa_share ?? null,
    cache_age_days: null,
    rank: null,
    percentile_top: null,
    category_rank: null,
    category_total: null,
  };
}

function lastUpdated(days) {
  if (days == null) return 'just now';
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${Math.round(days)}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function setStatus(html) {
  el('status').innerHTML = html;
  el('status').classList.remove('hidden');
}
const clearStatus = () => el('status').classList.add('hidden');

function loadingChart(text) {
  return `<div class="loader">
    <svg class="chart" width="160" height="64" viewBox="0 0 160 64">
      <defs>
        <linearGradient id="lg" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stop-color="#7c6ef5"/>
          <stop offset="100%" stop-color="#3de0a0"/>
        </linearGradient>
      </defs>
      <polyline points="0,56 25,48 50,52 75,30 100,36 130,12 160,4"
        fill="none" stroke="url(#lg)" stroke-width="3" stroke-linecap="round"
        stroke-linejoin="round" class="draw glow"/>
      <circle r="4" fill="#3de0a0" class="spark">
        <animateMotion dur="1.7s" repeatCount="indefinite"
          path="M0,56 25,48 50,52 75,30 100,36 130,12 160,4"/>
      </circle>
    </svg>
    <div class="loader-text">${text}</div>
  </div>`;
}

// Inline SVG icons
const ICONS = {
  megaphone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>`,
  pulse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  rank: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  creative: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 21 12 21 16 21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 4H4a2 2 0 0 0-2 2v2a6 6 0 0 0 12 0V6a2 2 0 0 0-2-2h-3"/><path d="M17 4h3a2 2 0 0 1 2 2v2a6 6 0 0 1-12 0V6a2 2 0 0 1 2-2h3"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
};

function metricRow(iconHtml, iconColor, label, valueHtml, valueClass) {
  return `<div class="metric-row">
    <div class="metric-icon ${iconColor}">${iconHtml}</div>
    <div class="metric-label">${label}</div>
    <div class="metric-value ${valueClass || ''}">${valueHtml}</div>
    <div class="metric-chevron">${ICONS.chevron}</div>
  </div>`;
}

function creativeRing(score) {
  if (score == null) return '<span style="color:var(--faint)">—</span>';
  const r = 9, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;
  const color = pct >= 65 ? '#3de0a0' : pct >= 40 ? '#f5a623' : '#9499b0';
  return `<div class="creative-ring">
    <svg class="ring-svg" width="22" height="22" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="${r}" fill="none" stroke="#1e2130" stroke-width="2.5"/>
      <circle cx="12" cy="12" r="${r}" fill="none" stroke="${color}" stroke-width="2.5"
        stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}"
        stroke-linecap="round" transform="rotate(-90 12 12)"/>
    </svg>
    <span style="color:${color}">${score}/100</span>
  </div>`;
}

function insightText(n) {
  const mom = n.growth_momentum;
  const meta = n.meta ?? 0;
  const rcs = n.real_creative_score;
  const dpa = n.dpa_share ?? 0;
  if (rcs != null && rcs >= 65 && meta >= 20)
    return 'Creative velocity is rising with strong paid-media activity.';
  if (dpa >= 0.5 && meta >= 30)
    return 'Ad volume is largely catalog/DPA — real creative output is lighter than the count suggests.';
  if (mom === 'Exploding' || mom === 'Accelerating')
    return 'Accelerating across paid channels — a high-priority account.';
  if (mom === 'Scaling')
    return 'Scaling steadily. Worth prioritizing for outreach.';
  if (meta >= 50)
    return 'High active ad volume — active creative testing motion detected.';
  if ((n.google ?? 0) > 0 && meta > 0)
    return 'Active on both Meta and Google — multi-channel advertiser.';
  if (mom === 'Emerging')
    return 'Early-stage paid investment — one to watch as they scale.';
  return 'Signals captured. Open the full report for a detailed breakdown.';
}

function insightConfidence(n) {
  const meta = n.meta ?? 0;
  if (meta >= 50 || n.real_creative_score != null) return 'High Confidence';
  if (meta >= 10) return 'Good Signal';
  return 'Low Signal';
}

function render(n) {
  current = n;
  const initials = n.brand.slice(0, 2).toUpperCase();

  const rankBadge = n.rank != null
    ? `<div class="rank-badge">📈 #${n.rank}${n.percentile_top != null ? ` · Top ${n.percentile_top}%` : ''}</div>`
    : '';

  const metaVal = n.meta != null ? String(n.meta) : '—';
  const momVal = n.growth_momentum
    ? `${n.growth_momentum} ${MOMENTUM_EMOJI[n.growth_momentum] || ''}`
    : '—';
  const momClass = n.growth_momentum ? (MOMENTUM_COLOR[n.growth_momentum] || '') : 'muted';
  const rankVal = n.rank != null ? `#${n.rank}` : n.growth_score != null ? `${n.growth_score}` : '—';
  const catRankVal = n.category_rank != null
    ? `#${n.category_rank}${n.category_total ? ` / ${n.category_total}` : ''}`
    : null;

  const extraRows = [];
  if ((n.google ?? 0) > 0) extraRows.push(metricRow(ICONS.globe, 'blue', 'Google Ads', String(n.google), ''));
  if ((n.linkedin ?? 0) > 0) extraRows.push(metricRow(ICONS.linkedin, 'blue', 'LinkedIn Ads', String(n.linkedin), ''));

  el('result').innerHTML = `
    <div class="brand-header">
      <div class="brand-avatar">${initials}</div>
      <div class="brand-meta">
        <div class="brand-name-row">
          <div class="r-name">${n.brand}</div>
        </div>
        <a class="r-domain" href="https://${n.domain}" target="_blank" rel="noopener">
          ${n.domain} ${ICONS.link}
        </a>
        ${rankBadge}
      </div>
    </div>

    <div class="metrics">
      ${metricRow(ICONS.megaphone, 'blue', 'Active Meta Ads', metaVal, '')}
      ${metricRow(ICONS.pulse, 'green', 'Momentum', momVal, momClass)}
      ${metricRow(ICONS.rank, 'purple', 'Growth Rank', rankVal, '')}
      ${metricRow(ICONS.creative, 'blue', 'Creative Score', creativeRing(n.real_creative_score), '')}
      ${catRankVal ? metricRow(ICONS.trophy, 'amber', 'Category Rank', catRankVal, '') : ''}
      ${extraRows.join('')}
      ${metricRow(ICONS.clock, 'gray', 'Last Updated', lastUpdated(n.cache_age_days), 'muted')}
    </div>

    <div class="insight-card">
      <div class="insight-sparkle">✦</div>
      <div class="insight-body">
        <div class="insight-top">
          <div class="insight-label">Key Insight</div>
          <div class="confidence-badge">${insightConfidence(n)}</div>
        </div>
        <div class="insight-text">${insightText(n)}</div>
      </div>
    </div>`;

  el('result').classList.remove('hidden');
  el('actions').classList.remove('hidden');
}

async function fetchRank(n) {
  try {
    const r = await fetch(`${API_BASE}/api/rank`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: n.domain, active_meta_ads: n.meta ?? 0, google_ads: n.google ?? 0, linkedin_ads: n.linkedin ?? 0, primary_category: n.category }),
    });
    const d = await r.json();
    n.rank = d.rank;
    n.percentile_top = d.percentile_top;
    n.category_rank = d.category_rank;
    n.category_total = d.category_total;
    render(n);
  } catch { /* ignore */ }
}

async function enrich(domain, facebookUrl, companyName) {
  const res = await fetch(`${API_BASE}/api/enrich-meta`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, facebook_url: facebookUrl || null, company_name: companyName || null, source: 'chrome_extension' }),
  });
  return res.ok ? res.json() : null;
}

async function analyze(domain) {
  if (!domain) return;
  el('result').classList.add('hidden');
  el('actions').classList.add('hidden');
  setStatus(loadingChart('Loading Growth Signals…'));
  try {
    const res = await fetch(`${API_BASE}/api/extension/lookup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(`<div class="error">${data.error || 'Something went wrong.'}</div>`);
      return;
    }

    if (data.signals) {
      clearStatus();
      const n = normalize(data.signals, data.domain);
      n.cache_age_days = data.cache_age_days;
      render(n);
      fetchRank(n);
    } else if (data.is_new) {
      setStatus(loadingChart('New company — building Growth Signals…'));
    } else {
      setStatus(loadingChart('Analyzing…'));
    }

    if (data.needs_enrichment) {
      const fresh = await enrich(data.domain, data.facebook_url, data.company_name);
      clearStatus();
      if (fresh?.ok) {
        const n = normalize(fresh.signals, data.domain);
        n.cache_age_days = 0;
        render(n);
        fetchRank(n);
      }
    }
  } catch {
    setStatus('<div class="error">Network error. Check the API URL in settings.</div>');
  }
}

async function saveTo(list) {
  if (!current) return;
  await fetch(`${API_BASE}/api/watchlist`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: current.domain, brand_name: current.brand, list_name: list }),
  });
}

(async function init() {
  API_BASE = await getApiBase();
  const detected = await detectDomain();
  el('domain').value = detected;
  if (detected) analyze(detected);

  el('analyze').addEventListener('click', () => analyze(el('domain').value.trim()));
  el('domain').addEventListener('keydown', (e) => { if (e.key === 'Enter') analyze(el('domain').value.trim()); });
  el('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

  el('open-tab').addEventListener('click', () => chrome.tabs.create({ url: `${API_BASE}/` }));

  el('open-report').addEventListener('click', () => {
    if (current) chrome.tabs.create({ url: `${API_BASE}/?domain=${encodeURIComponent(current.domain)}` });
  });

  el('save').addEventListener('click', async (e) => {
    await saveTo('Prospects');
    e.currentTarget.innerHTML = `${ICONS.check} Saved`;
    e.currentTarget.classList.add('ok');
  });

  const lists = el('lists');
  lists.innerHTML = WATCHLISTS.map((l) => `<button data-list="${l}">${l}</button>`).join('');
  el('add-watchlist').addEventListener('click', () => lists.classList.toggle('hidden'));
  lists.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', async () => {
      await saveTo(b.dataset.list);
      lists.classList.add('hidden');
      const btn = el('add-watchlist');
      btn.innerHTML = `${ICONS.check} ${b.dataset.list}`;
      btn.classList.add('ok');
    })
  );
})();
