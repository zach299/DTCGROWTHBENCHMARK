// Growth Signals — Chrome extension popup (dark, premium, rep-first).
// Every lookup runs through /api/extension/lookup, which makes unknown domains
// first-class companies and reports 7-day cache state. Stale/missing data is
// enriched automatically without blocking the cached view.
const DEFAULT_API_BASE = 'https://dtcgrowthbenchmark.vercel.app';
const SKIP_HOSTS = [
  'linkedin.com', 'facebook.com', 'instagram.com', 'google.com', 'x.com',
  'twitter.com', 'youtube.com', 'tiktok.com', 'myshopify.com', 'pinterest.com',
];
const WATCHLISTS = ['Prospects', 'Clients', 'Competitors'];
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

// Map a company_meta_signals row (from lookup or enrich-meta) to the view model.
function normalize(sig, domain) {
  const s = sig || {};
  return {
    domain: domain || s.domain,
    brand: s.company_name || (domain || s.domain || '').replace(/^www\./, '').split('.')[0],
    category: s.primary_category || null,
    growth_momentum: s.growth_momentum || null,
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
  if (days < 30) return `${Math.round(days)} days ago`;
  return `${Math.round(days / 30)} mo ago`;
}

function setStatus(html) {
  el('status').innerHTML = html;
  el('status').classList.remove('hidden');
}
const clearStatus = () => el('status').classList.add('hidden');

// Alive loader: chart line grows upward with a glowing spark running along it.
function loadingChart(text) {
  return `
    <div class="loader">
      <svg class="chart" width="180" height="80" viewBox="0 0 180 80">
        <defs>
          <linearGradient id="lg" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#34d399"/>
          </linearGradient>
        </defs>
        <polyline points="0,70 30,60 60,64 90,38 120,46 150,18 180,6"
          fill="none" stroke="url(#lg)" stroke-width="3.5" stroke-linecap="round"
          stroke-linejoin="round" class="draw glow"/>
        <circle r="4" fill="#34d399" class="spark"><animateMotion dur="1.7s" repeatCount="indefinite"
          path="M0,70 30,60 60,64 90,38 120,46 150,18 180,6"/></circle>
      </svg>
      <div class="loader-text">${text}</div>
    </div>`;
}

function render(n) {
  current = n;
  const rankLine =
    n.rank != null
      ? `<div class="rank-badge">⚡ Growth Rank #${n.rank}${n.percentile_top != null ? ` · Top ${n.percentile_top}%` : ''}</div>`
      : '';
  const catLine =
    n.category_rank != null && n.category
      ? `<div class="row"><span class="label">${n.category} Rank</span><span class="value">#${n.category_rank}${n.category_total ? ` of ${n.category_total}` : ''}</span></div>`
      : n.category
        ? `<div class="row"><span class="label">Category</span><span class="value">${n.category}</span></div>`
        : '';
  el('result').innerHTML = `
    <div class="r-name">${n.brand}</div>
    <div class="r-domain">${n.domain}</div>
    ${rankLine}
    <div class="rows">
      <div class="row"><span class="label">Momentum</span><span class="value green">${n.growth_momentum ?? '—'} ${n.growth_momentum ? MOMENTUM_EMOJI[n.growth_momentum] || '' : ''}</span></div>
      <div class="row"><span class="label">Est. Revenue</span><span class="value">${n.revenue_range ?? '—'}</span></div>
      ${catLine}
      <div class="row chan"><span class="label">Meta Ads</span><span class="value">${n.meta ?? '—'}</span></div>
      <div class="row chan"><span class="label">Google Ads</span><span class="value">${n.google ?? 0}</span></div>
      <div class="row chan"><span class="label">LinkedIn Ads</span><span class="value">${n.linkedin ?? 0}</span></div>
      ${n.real_creative_score != null ? `<div class="row"><span class="label">Creative Score</span><span class="value">${n.real_creative_score}${n.dpa_share != null && n.dpa_share >= 0.5 ? ' <span style="color:#f87171;font-size:11px">catalog-heavy</span>' : ''}</span></div>` : ''}
      <div class="row"><span class="label">Last Updated</span><span class="value muted">${lastUpdated(n.cache_age_days)}</span></div>
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

    // Show cached signals instantly if we have any.
    if (data.signals) {
      clearStatus();
      const n = normalize(data.signals, data.domain);
      n.cache_age_days = data.cache_age_days;
      render(n);
      fetchRank(n);
    } else if (data.is_new) {
      setStatus(loadingChart('New company detected. Building Growth Signals…'));
    } else {
      setStatus(loadingChart('Analyzing company…'));
    }

    // Auto-enrich when missing or stale (7-day refresh) — non-blocking for cache.
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
  el('open-report').addEventListener('click', () => {
    if (current) chrome.tabs.create({ url: `${API_BASE}/?domain=${encodeURIComponent(current.domain)}` });
  });
  el('save').addEventListener('click', async (e) => {
    await saveTo('Prospects');
    e.target.textContent = '✓ Saved'; e.target.classList.add('ok');
  });
  const lists = el('lists');
  lists.innerHTML = WATCHLISTS.map((l) => `<button data-list="${l}">Add to ${l}</button>`).join('');
  el('add-watchlist').addEventListener('click', () => lists.classList.toggle('hidden'));
  lists.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', async () => {
      await saveTo(b.dataset.list);
      lists.classList.add('hidden');
      el('add-watchlist').textContent = `✓ ${b.dataset.list}`;
    })
  );
})();
