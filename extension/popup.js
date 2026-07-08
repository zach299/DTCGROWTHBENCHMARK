// Tambourine — Chrome extension popup (premium dark redesign v2).
// Find your fastest-growing TAM: account-level growth signals on every site.
// Every lookup runs through /api/extension/lookup, which handles unknown domains
// and returns 7-day cache state. Stale/missing data is enriched automatically.
const DEFAULT_API_BASE = 'https://dtcgrowthbenchmark.vercel.app';
const SKIP_HOSTS = [
  'linkedin.com', 'facebook.com', 'instagram.com', 'google.com', 'x.com',
  'twitter.com', 'youtube.com', 'tiktok.com', 'myshopify.com', 'pinterest.com',
];
const WATCHLISTS = ['Prospects', 'Clients', 'Competitors'];

const MOMENTUM_COLOR = {
  Exploding: 'green', Accelerating: 'green', Scaling: 'indigo', Emerging: 'amber', Dormant: 'gray',
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
    revenue_confidence: s.revenue_confidence || null,
    meta: s.active_meta_ads ?? null,
    google: s.google_ads ?? 0,
    linkedin: s.linkedin_ads ?? 0,
    campaign_themes: s.campaign_themes || [],
    real_creative_score: s.real_creative_score ?? null,
    dpa_share: s.dpa_share ?? null,
    last_enriched_at: s.last_enriched_at || null,
    cache_age_days: null,
    history: [],
    spend_estimate: null,
    outbound_angle: null,
    rank: null,
    percentile_top: null,
    category_rank: null,
    category_total: null,
  };
}

function lastUpdated(days, last_enriched_at) {
  if (days == null && last_enriched_at) {
    const hoursAgo = (Date.now() - new Date(last_enriched_at).getTime()) / 3600000;
    if (hoursAgo < 1) return 'just now';
    if (hoursAgo < 24) return `${Math.round(hoursAgo)}h ago`;
    return `${Math.round(hoursAgo / 24)}d ago`;
  }
  if (days == null) return 'just now';
  if (days < 1) {
    // try hours
    return 'today';
  }
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
  report: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  miniChart: `<svg width="28" height="14" viewBox="0 0 28 14" fill="none" class="mini-chart"><polyline points="0,12 6,9 11,10 16,5 21,7 28,1" stroke="#7c6ef5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// ── Google G icon (colorful) ──
function googleGIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>`;
}

// ── Meta M icon ──
function metaMIcon() {
  return `<div class="ad-icon meta">M</div>`;
}

// ── LinkedIn in icon ──
function linkedinIcon() {
  return `<div class="ad-icon linkedin-icon" style="font-size:9px;font-weight:900;letter-spacing:-0.5px">in</div>`;
}

function briefText(n) {
  const name = n.brand;
  const cat = n.category ? n.category.toLowerCase() : 'DTC';
  const meta = n.meta ?? 0;
  const mom = n.growth_momentum;
  const rev = n.revenue_range;

  let s1 = `<b>${name}</b> is a ${cat.replace(/^\/+/, '').replace(/\//g, ' / ')} brand`;
  if (rev) s1 += ` with estimated revenue of <b>${rev}</b>`;
  s1 += '.';

  let s2 = '';
  if (mom === 'Exploding' || mom === 'Accelerating') {
    s2 = ` Momentum is ${mom.toLowerCase()} — signals point to aggressive paid-media scaling`;
    if (meta > 0) s2 += ` with <b>${meta} active Meta ads</b>`;
    s2 += '.';
  } else if (mom === 'Scaling') {
    s2 = ' Scaling steadily across paid channels';
    if (meta > 0) s2 += ` with <b>${meta} active Meta ads</b>`;
    s2 += ' — a solid outreach prospect.';
  } else if (mom === 'Emerging') {
    s2 = ' Early-stage paid investment detected';
    if (meta > 0) s2 += ` (<b>${meta} active Meta ads</b>)`;
    s2 += ' — one to watch as they scale.';
  } else if (meta > 0) {
    s2 = ` Currently running <b>${meta} active Meta ads</b>`;
    if ((n.google ?? 0) > 0) s2 += ` and <b>${n.google} Google ads</b>`;
    s2 += '.';
  } else {
    s2 = ' Limited paid signal detected — open the full report for a deeper breakdown.';
  }
  return s1 + s2;
}

function briefConfidence(n) {
  const meta = n.meta ?? 0;
  if (meta >= 50 || n.real_creative_score != null) return { label: 'High Confidence', cls: 'green' };
  if (meta >= 10) return { label: 'Good Signal', cls: 'amber' };
  return { label: 'Low Signal', cls: 'gray' };
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

function revenueConfidenceLabel(conf) {
  if (!conf) return { label: '', cls: 'gray' };
  if (conf === 'high') return { label: 'High Confidence', cls: 'green' };
  if (conf === 'medium') return { label: 'Med Confidence', cls: 'amber' };
  return { label: 'Low Confidence', cls: 'gray' };
}

function faviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

// ── Growth trend mini chart (hand-rolled inline SVG) ──
function historyChange(history) {
  const pts = (history || []).filter((h) => h && h.growth_score != null);
  if (pts.length < 2) return null;
  const first = pts[0].growth_score;
  const last = pts[pts.length - 1].growth_score;
  if (!first) return null;
  const pct = ((last - first) / Math.abs(first)) * 100;
  return { pct: Math.round(pct * 10) / 10, first, last };
}

function trendSection(history, growthScore) {
  const pts = (history || []).filter((h) => h && h.growth_score != null);
  let body;
  if (pts.length < 2) {
    const score = growthScore != null ? growthScore : (pts[0]?.growth_score ?? null);
    body = `
      <div class="trend-empty">
        <svg width="440" height="34" viewBox="0 0 440 34" class="trend-baseline" preserveAspectRatio="none">
          <line x1="6" y1="17" x2="434" y2="17" stroke="#2a2f42" stroke-width="2"
            stroke-dasharray="3 6" stroke-linecap="round"/>
          <circle cx="434" cy="17" r="4" fill="#3de0a0" stroke="#10121a" stroke-width="1.5"/>
        </svg>
        <div class="trend-empty-meta">
          ${score != null ? `<span class="trend-empty-score">Score ${score}</span>` : ''}
          <span class="trend-empty-text">Tracking started — history builds with each refresh</span>
        </div>
      </div>`;
  } else {
    const W = 440, H = 64, PAD = 6;
    const vals = pts.map((p) => p.growth_score);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const x = (i) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
    const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);
    const coords = pts.map((p, i) => [x(i), y(p.growth_score)]);
    const line = coords.map(([cx, cy]) => `${cx.toFixed(1)},${cy.toFixed(1)}`).join(' ');
    const area = `${PAD},${H} ${line} ${(W - PAD).toFixed(1)},${H}`;
    const [lx, ly] = coords[coords.length - 1];
    const chg = historyChange(history);
    const chgLabel = chg
      ? `<span class="trend-change ${chg.pct >= 0 ? 'up' : 'down'}">${chg.pct >= 0 ? '+' : ''}${chg.pct}%</span>`
      : '';
    body = `
      <div class="trend-chart-wrap">
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="trend-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#7c6ef5" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="#7c6ef5" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="trend-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#7c6ef5"/>
              <stop offset="100%" stop-color="#3de0a0"/>
            </linearGradient>
          </defs>
          <polygon points="${area}" fill="url(#trend-fill)"/>
          <polyline points="${line}" fill="none" stroke="url(#trend-stroke)"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" fill="#3de0a0"
            stroke="#10121a" stroke-width="1.5"/>
        </svg>
        <div class="trend-meta">
          <span class="trend-range">${pts.length} snapshots</span>
          ${chgLabel}
        </div>
      </div>`;
  }
  return `
    <div class="trend-section">
      <div class="themes-label">Growth Trend</div>
      ${body}
    </div>`;
}

// ── Est. monthly ad spend row ──
function spendRow(spend) {
  if (!spend || !spend.label) return '';
  const dot = spend.confidence === 'high' ? 'green' : spend.confidence === 'medium' ? 'amber' : 'gray';
  return `
    <div class="spend-row">
      <div class="spend-left">
        <div class="spend-label">Est. Annual Ad Spend</div>
        <div class="spend-sub">Estimated from ad signals</div>
      </div>
      <div class="spend-right">
        <span class="conf-dot ${dot}"></span>
        <span class="spend-value">${spend.label}</span>
      </div>
    </div>`;
}

function render(n) {
  current = n;
  const initials = n.brand.slice(0, 2).toUpperCase();
  const domain = n.domain || '';

  // Momentum pill
  const momColor = n.growth_momentum ? (MOMENTUM_COLOR[n.growth_momentum] || 'gray') : 'gray';
  const momEmoji = n.growth_momentum ? (MOMENTUM_EMOJI[n.growth_momentum] || '') : '';
  const momLabel = n.growth_momentum || 'Unknown';
  const chg = historyChange(n.history);
  const changePill = chg
    ? `<div class="change-pill ${chg.pct >= 0 ? 'up' : 'down'}" title="Growth score change across tracked snapshots">${chg.pct >= 0 ? '+' : ''}${chg.pct}% since last tracked</div>`
    : '';
  const momentumPill = `<div class="pill-stack">${changePill}<div class="momentum-pill ${momColor}">${momEmoji} ${momLabel}</div></div>`;

  // Logo — favicon with initials fallback
  const logoHtml = `
    <div class="co-logo" id="co-logo-wrap">
      <img src="${faviconUrl(domain)}" alt=""
        onload="this.style.opacity=1"
        onerror="this.style.display='none';document.getElementById('co-logo-wrap').textContent='${initials}'"
        style="opacity:0;transition:opacity 0.2s"/>
    </div>`;

  // Stats grid
  const growthScore = n.growth_score != null ? String(n.growth_score) : '—';
  const revRange = n.revenue_range || '—';
  const revConf = revenueConfidenceLabel(n.revenue_confidence);
  const metaCount = n.meta != null ? String(n.meta) : '—';
  const googleCount = (n.google ?? 0) > 0 ? String(n.google) : '—';
  const linkedinCount = (n.linkedin ?? 0) > 0 ? String(n.linkedin) : '—';

  const statsGrid = `
    <div class="stats-grid">
      <div class="stat-col">
        <div class="stat-value indigo">${growthScore}</div>
        <div class="stat-icon-row">${ICONS.miniChart}</div>
        <div class="stat-label">Growth Score</div>
      </div>
      <div class="stat-col">
        <div class="stat-value" style="font-size:13px;font-weight:700;letter-spacing:-0.01em">${revRange}</div>
        <div class="stat-sub ${revConf.cls}">${revConf.label}</div>
        <div class="stat-label" style="margin-top:3px">Est. Revenue</div>
      </div>
      <div class="stat-col">
        <div class="stat-value">${metaCount}</div>
        <div class="stat-icon-row">${metaMIcon()}</div>
        <div class="stat-label">Meta Ads</div>
      </div>
      <div class="stat-col">
        <div class="stat-value">${googleCount}</div>
        <div class="stat-icon-row">${googleGIcon()}</div>
        <div class="stat-label">Google Ads</div>
      </div>
      <div class="stat-col">
        <div class="stat-value">${linkedinCount}</div>
        <div class="stat-icon-row">${linkedinIcon()}</div>
        <div class="stat-label">LinkedIn Ads</div>
      </div>
    </div>`;

  // Campaign themes
  const themes = (n.campaign_themes || []).slice(0, 6);
  const themesSection = themes.length > 0 ? `
    <div class="themes-section">
      <div class="themes-label">Top Campaign Themes</div>
      <div class="themes-pills">
        ${themes.map((t) => `<div class="theme-pill">${t}</div>`).join('')}
      </div>
    </div>` : '';

  // Research brief
  const conf = briefConfidence(n);
  const updatedStr = lastUpdated(n.cache_age_days, n.last_enriched_at);
  const briefCard = `
    <div class="brief-card">
      <div class="brief-header">
        <div class="brief-label">📋 Research Brief</div>
        <div class="confidence-pill ${conf.cls}">${conf.label}</div>
      </div>
      <div class="brief-text">${briefText(n)}</div>
      <div class="brief-footer">
        ${ICONS.clock}
        Last updated ${updatedStr}
      </div>
    </div>`;

  // Action row: brief, copy outbound angle, save
  const copyBtn = n.outbound_angle
    ? `<button class="action-btn" id="copy-angle">${ICONS.creative} Copy Angle</button>`
    : '';
  const actionRow = `
    <div class="action-row">
      <button class="action-btn" id="open-report">
        ${ICONS.report} Research Brief
      </button>
      ${copyBtn}
      <button class="action-btn" id="save">
        ${ICONS.bookmark} Save
      </button>
    </div>`;

  // Big CTA: watchlist (dropdown opens above)
  const ctaBtn = `
    <div class="add-wrap cta-wrap">
      <button class="cta-btn" id="add-watchlist">
        ${ICONS.eye} Add to Watchlist
      </button>
      <div id="lists" class="lists hidden"></div>
    </div>`;

  el('result').innerHTML = `
    <div class="co-header">
      ${logoHtml}
      <div class="co-info">
        <div class="co-name">${n.brand}</div>
        <a class="co-domain" href="https://${domain}" target="_blank" rel="noopener">
          ${domain} ${ICONS.link}
        </a>
      </div>
      ${momentumPill}
    </div>
    ${statsGrid}
    ${spendRow(n.spend_estimate)}
    ${trendSection(n.history, n.growth_score)}
    ${themesSection}
    ${briefCard}
    ${actionRow}
    ${ctaBtn}`;

  el('result').classList.remove('hidden');

  // Re-bind inline buttons (they're now inside #result)
  bindResultButtons(n);
}

function bindResultButtons(n) {
  const openReport = el('open-report');
  if (openReport) {
    openReport.addEventListener('click', () => {
      chrome.tabs.create({ url: `${API_BASE}/?domain=${encodeURIComponent(n.domain)}` });
    });
  }

  const copyAngle = el('copy-angle');
  if (copyAngle) {
    copyAngle.addEventListener('click', async () => {
      if (!n.outbound_angle) return;
      try {
        await navigator.clipboard.writeText(n.outbound_angle);
        const original = copyAngle.innerHTML;
        copyAngle.innerHTML = `${ICONS.check} Copied ✓`;
        copyAngle.classList.add('ok');
        setTimeout(() => {
          copyAngle.innerHTML = original;
          copyAngle.classList.remove('ok');
        }, 1500);
      } catch { /* clipboard unavailable */ }
    });
  }

  const saveBtn = el('save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      await saveTo('Prospects');
      e.currentTarget.innerHTML = `${ICONS.check} Saved`;
      e.currentTarget.classList.add('ok');
    });
  }

  const listsEl = el('lists');
  if (listsEl) {
    listsEl.innerHTML = WATCHLISTS.map((l) => `<button data-list="${l}">${l}</button>`).join('');
    const watchlistBtn = el('add-watchlist');
    if (watchlistBtn) {
      watchlistBtn.addEventListener('click', () => listsEl.classList.toggle('hidden'));
    }
    listsEl.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', async () => {
        await saveTo(b.dataset.list);
        listsEl.classList.add('hidden');
        const btn = el('add-watchlist');
        if (btn) {
          btn.innerHTML = `${ICONS.check} ${b.dataset.list}`;
          btn.classList.add('ok');
        }
      })
    );
  }
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

function setRefreshBadge(show) {
  const badge = document.getElementById('refresh-badge');
  if (badge) badge.style.display = show ? 'flex' : 'none';
}

function renderPending(domain) {
  const brand = domain.replace(/^www\./, '').split('.')[0];
  const initials = brand.slice(0, 2).toUpperCase();
  el('result').innerHTML = `
    <div class="co-header">
      <div class="co-logo" style="opacity:0.45">${initials}</div>
      <div class="co-info">
        <div class="co-name" style="opacity:0.6">${brand}</div>
        <a class="co-domain" href="https://${domain}" target="_blank" rel="noopener">
          ${domain} ${ICONS.link}
        </a>
      </div>
    </div>
    <div class="pending-card">
      <div class="pending-icon">${ICONS.pulse}</div>
      <div class="pending-body">
        <div class="pending-title">Enriching now…</div>
        <div class="pending-sub">First-time analysis takes ~30 seconds. Results save automatically — you can close this and reopen when done.</div>
      </div>
    </div>`;
  el('result').classList.remove('hidden');
}

async function enrichBackground(domain, facebookUrl, companyName, onDone) {
  try {
    const res = await fetch(`${API_BASE}/api/enrich-meta`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, facebook_url: facebookUrl || null, company_name: companyName || null, source: 'chrome_extension' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && onDone) onDone(data);
    }
  } catch { /* network error — enrichment will be retried by worker */ }
}

async function analyze(domain) {
  if (!domain) return;
  el('result').classList.add('hidden');
  setStatus(loadingChart('Loading growth signals…'));
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
      // Cached data — show immediately, no waiting.
      clearStatus();
      const n = normalize(data.signals, data.domain);
      n.cache_age_days = data.cache_age_days;
      n.history = data.history || [];
      n.spend_estimate = data.spend_estimate || null;
      n.outbound_angle = data.outbound_angle || null;
      render(n);
      fetchRank(n);

      if (data.needs_enrichment) {
        // Stale cache — refresh silently in background, update if still open.
        setRefreshBadge(true);
        enrichBackground(data.domain, data.facebook_url, data.company_name, (fresh) => {
          setRefreshBadge(false);
          const updated = normalize(fresh.signals, data.domain);
          updated.cache_age_days = 0;
          updated.history = data.history || [];
          updated.spend_estimate = data.spend_estimate || null;
          updated.outbound_angle = data.outbound_angle || null;
          render(updated);
          fetchRank(updated);
        });
      }
    } else {
      // No cached data — show pending state, then populate when enrichment returns.
      clearStatus();
      renderPending(data.domain || domain);
      enrichBackground(data.domain || domain, data.facebook_url, data.company_name, (fresh) => {
        const n = normalize(fresh.signals, data.domain || domain);
        n.cache_age_days = 0;
        n.history = data.history || [];
        n.spend_estimate = data.spend_estimate || null;
        n.outbound_angle = data.outbound_angle || null;
        render(n);
        fetchRank(n);
      });
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

  // Legacy #actions open-report / save / add-watchlist — now rendered inside #result per lookup.
  // The legacy hidden #actions div in HTML is kept only for structural compat.
})();
