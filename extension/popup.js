// Growth Signals — Chrome extension popup (dark, condensed).
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

function normalize(data, company) {
  const a = data.analysis ?? data;
  const co = company ?? data.company ?? {};
  const adCount = (name) => {
    const p = (a.ad_platforms ?? []).find((x) => x.platform === name);
    return p && p.status === 'active' ? p.ads_count ?? 0 : null;
  };
  return {
    domain: data.domain || co.domain,
    brand: a.meta_ads?.advertiser_name || (data.domain || co.domain || '').replace(/^www\./, '').split('.')[0],
    growth_momentum: a.growth_momentum ?? null,
    meta: a.meta_ads?.active_ads_count ?? adCount('Meta'),
    cache_age_days: data.cache_age_days ?? a.cache_age_days ?? null,
    research_brief: a.research_brief ?? null,
    rank: null,
    percentile_top: null,
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

function loadingChart(text) {
  return `
    <svg class="chart" width="160" height="70" viewBox="0 0 160 70">
      <polyline points="0,60 26,52 52,55 78,34 104,40 130,18 160,6" fill="none" stroke="#6366f1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="draw"/>
    </svg>
    <div>${text}</div>`;
}

function render(n) {
  current = n;
  const rankLine =
    n.rank != null
      ? `<div class="rank-badge">🔥 #${n.rank}${n.percentile_top != null ? ` · Top ${n.percentile_top}%` : ''}</div>`
      : '';
  el('result').innerHTML = `
    <div class="r-name">${n.brand}</div>
    <div class="r-domain">${n.domain}</div>
    ${rankLine}
    <div class="rows">
      <div class="row"><span class="label">Meta Ads</span><span class="value">${n.meta ?? '—'}</span></div>
      <div class="row"><span class="label">Momentum</span><span class="value green">${n.growth_momentum ?? '—'} ${n.growth_momentum ? MOMENTUM_EMOJI[n.growth_momentum] || '' : ''}</span></div>
      ${n.rank != null ? `<div class="row"><span class="label">Growth Rank</span><span class="value">#${n.rank}</span></div>` : ''}
      <div class="row"><span class="label">Last Updated</span><span class="value">${lastUpdated(n.cache_age_days)}</span></div>
    </div>`;
  el('result').classList.remove('hidden');
  el('actions').classList.remove('hidden');
}

async function fetchRank(n) {
  if (n.meta == null) return;
  try {
    const r = await fetch(`${API_BASE}/api/rank`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: n.domain, active_meta_ads: n.meta }),
    });
    const d = await r.json();
    n.rank = d.rank;
    n.percentile_top = d.percentile_top;
    render(n);
  } catch { /* ignore */ }
}

async function analyze(domain) {
  if (!domain) return;
  el('result').classList.add('hidden');
  el('actions').classList.add('hidden');
  setStatus(loadingChart('Loading Growth Signals…'));
  try {
    const res = await fetch(`${API_BASE}/api/company`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(`<div class="error">${res.status === 404 ? `"${domain}" isn't in the database.` : (data.error || 'Something went wrong.')}</div>`);
      return;
    }
    if (data.analysis) {
      clearStatus();
      const n = normalize(data, data.company);
      render(n);
      fetchRank(n);
    } else {
      setStatus(loadingChart('Analyzing company…'));
    }
    if (data.needs_enrichment) {
      const enrich = await fetch(`${API_BASE}/api/analyze-domain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const fresh = await enrich.json();
      if (enrich.ok) {
        clearStatus();
        const n = normalize(fresh);
        render(n);
        fetchRank(n);
      } else clearStatus();
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
