// Growth Signals — Chrome extension popup.
const DEFAULT_API_BASE = 'https://dtcgrowthbenchmark.vercel.app';
const SKIP_HOSTS = [
  'linkedin.com', 'facebook.com', 'instagram.com', 'google.com', 'x.com',
  'twitter.com', 'youtube.com', 'tiktok.com', 'myshopify.com', 'pinterest.com',
];
const WATCHLISTS = ['Prospects', 'Clients', 'Competitors'];
const MOMENTUM_EMOJI = { Dormant: '😴', Emerging: '🌱', Scaling: '📈', Accelerating: '🚀', Exploding: '💥' };

const el = (id) => document.getElementById(id);
let API_BASE = DEFAULT_API_BASE;
let current = null; // normalized result

async function getApiBase() {
  return new Promise((res) => {
    chrome.storage.sync.get(['apiBase'], (v) => res((v.apiBase || DEFAULT_API_BASE).replace(/\/$/, '')));
  });
}

async function detectDomain() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      try {
        const host = new URL(tabs[0].url).hostname.replace(/^www\./, '');
        if (SKIP_HOSTS.some((s) => host === s || host.endsWith('.' + s))) return resolve('');
        resolve(host);
      } catch {
        resolve('');
      }
    });
  });
}

// Normalize the two API response shapes (/api/company vs /api/analyze-domain).
function normalize(data, company) {
  const a = data.analysis ?? data; // company endpoint nests under .analysis
  const co = company ?? data.company ?? {};
  const adCount = (name) => {
    const p = (a.ad_platforms ?? []).find((x) => x.platform === name);
    return p && p.status === 'active' ? p.ads_count ?? 0 : null;
  };
  return {
    domain: data.domain || co.domain,
    brand: a.meta_ads?.advertiser_name || (data.domain || co.domain || '').replace(/^www\./, '').split('.')[0],
    growth_score: a.growth_score,
    growth_momentum: a.growth_momentum,
    revenue_range: a.revenue_range,
    revenue_confidence: a.revenue_confidence,
    meta: a.meta_ads?.active_ads_count ?? adCount('Meta'),
    google: adCount('Google'),
    linkedin: adCount('LinkedIn'),
    themes: a.landing_page_signals?.campaign_themes ?? [],
    research_brief: a.research_brief ?? null,
  };
}

function setStatus(html) {
  el('status').innerHTML = html;
  el('status').classList.remove('hidden');
}
function clearStatus() { el('status').classList.add('hidden'); }

function render(n) {
  current = n;
  const platforms = [
    ['Meta', n.meta], ['Google', n.google], ['LinkedIn', n.linkedin],
  ].map(([name, c]) => `
    <div class="platform"><div class="p-name">${name}</div>
      <div class="p-count">${c == null ? '—' : c}</div></div>`).join('');
  const themes = n.themes.length
    ? `<div class="section-label">Top Campaign Themes</div><div class="chips">${n.themes.slice(0, 6).map((t) => `<span class="chip">${t}</span>`).join('')}</div>`
    : '';
  const briefSummary = n.research_brief ? extractOverview(n.research_brief) : '';
  el('result').innerHTML = `
    <div class="r-head">
      <div><div class="r-name">${n.brand}</div><div class="r-domain">${n.domain}</div></div>
      ${n.growth_momentum ? `<span class="badge green">${n.growth_momentum} ${MOMENTUM_EMOJI[n.growth_momentum] || ''}</span>` : ''}
    </div>
    <div class="r-grid">
      <div><div class="kpi-label">Growth Score</div><div class="kpi-value">${n.growth_score ?? '—'}</div></div>
      <div><div class="kpi-label">Est. Revenue</div><div class="kpi-value small">${n.revenue_range ?? '—'}</div></div>
    </div>
    <div class="platforms">${platforms}</div>
    ${themes}
    ${briefSummary ? `<div class="section-label">Research Brief</div><div class="brief">${briefSummary}</div>` : ''}
  `;
  el('result').classList.remove('hidden');
  el('actions').classList.remove('hidden');
}

function extractOverview(brief) {
  // Show Business Overview + Recommended Outreach Angle compactly.
  const grab = (header) => {
    const re = new RegExp(`## ${header}\\n([\\s\\S]*?)(?:\\n## |$)`);
    const m = brief.match(re);
    return m ? m[1].trim() : '';
  };
  const overview = grab('Business Overview');
  const angle = grab('Recommended Outreach Angle');
  return [overview, angle && `\n\nAngle: ${angle}`].filter(Boolean).join('');
}

async function analyze(domain) {
  if (!domain) return;
  el('result').classList.add('hidden');
  el('actions').classList.add('hidden');
  setStatus('<span class="spinner"></span> Looking up ' + domain + '…');
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
      render(normalize(data, data.company));
    } else {
      // Not analyzed yet — show the company, run enrichment, refresh.
      render(normalize({ analysis: {}, domain: data.domain, company: data.company }, data.company));
      setStatus('<span class="spinner"></span> Analyzing company…');
    }
    if (data.needs_enrichment) {
      const enrich = await fetch(`${API_BASE}/api/analyze-domain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const fresh = await enrich.json();
      if (enrich.ok) {
        clearStatus();
        render(normalize(fresh));
      } else {
        clearStatus();
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

// ---- wire up ----
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
  el('brief').addEventListener('click', () => {
    if (current?.research_brief) {
      navigator.clipboard.writeText(current.research_brief);
      el('brief').textContent = '✓ Copied';
    }
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
