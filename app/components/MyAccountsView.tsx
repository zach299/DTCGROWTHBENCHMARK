'use client';

// My Accounts — book-of-business monitor (the rep-retention wedge). Distinct
// from Build TAM List: instead of discovering new accounts, reps import the
// accounts they already own and Tambourine tells them which ones are growing
// right now. Domains persist in localStorage (per Supabase user) AND the
// watchlist under 'My Accounts' so the set survives devices.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CRM_PROVIDERS } from '@/lib/crm';
import { buildPersonaReason, type Persona } from '@/lib/persona';
import { buildReason, type ReasonInputs } from '@/lib/reason';
import type { SpendEstimate } from '@/lib/adSpend';
import { usePersona } from './usePersona';
import { useAuth } from './AuthProvider';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import SpendEstimateBadge from './SpendEstimateBadge';
import {
  BuildingIcon,
  BellIcon,
  BoltIcon,
  TrendUpIcon,
  StarIcon,
  DocIcon,
  CopyIcon,
  SparkleIcon,
  UploadIcon,
  ExternalLinkIcon,
  XIcon,
  ClockIcon,
} from './icons';
import {
  MY_ACCOUNTS_LIST,
  loadMyAccountDomains,
  parseDomainText,
  parseDomainsCsv,
  readStoredDomains,
  writeStoredDomains,
} from './myAccounts';

const MAX_DOMAINS = 500;

export interface ScoredAccount {
  domain: string;
  company_name: string | null;
  category: string | null;
  revenue_range: string | null;
  growth_score: number | null;
  growth_momentum: string | null;
  spend_estimate: SpendEstimate | null;
  reason_inputs: ReasonInputs | null;
  reason: string;
  outbound_angle: string;
  snapshot_count: number;
  trend_status: 'not_started' | 'tracking_started' | 'trend_ready';
  last_enriched_at: string | null;
}

export interface GrowthAlert {
  domain: string;
  type: 'entered_exploding' | 'score_jump' | 'entered_top1pct';
  headline: string;
  detail: string;
  observed_at: string;
}

export const ALERTS_EMPTY_COPY =
  'No growth alerts yet — alerts fire when an account enters Exploding momentum, jumps 10+ score points, or enters the top 1%.';

const ALERT_META: Record<GrowthAlert['type'], { icon: React.ReactNode; tone: string }> = {
  entered_exploding: {
    icon: <BoltIcon width={14} height={14} />,
    tone: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  },
  score_jump: {
    icon: <TrendUpIcon width={14} height={14} />,
    tone: 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/20',
  },
  entered_top1pct: {
    icon: <StarIcon width={14} height={14} />,
    tone: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  },
};

function alertDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AlertCard({ alert }: { alert: GrowthAlert }) {
  const meta = ALERT_META[alert.type];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${meta.tone}`}>
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-gray-900">{alert.headline}</span>
          <span className="shrink-0 text-[11px] text-gray-400">{alertDate(alert.observed_at)}</span>
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-gray-500">{alert.detail}</p>
      </div>
    </div>
  );
}

const MOMENTUM_ORDER: Record<string, number> = {
  Exploding: 5,
  Accelerating: 4,
  Scaling: 3,
  Emerging: 2,
  Dormant: 1,
};
const MOMENTUM_DOT: Record<string, string> = {
  Exploding: 'bg-emerald-400',
  Accelerating: 'bg-emerald-400',
  Scaling: 'bg-teal-400',
  Emerging: 'bg-amber-400',
  Dormant: 'bg-gray-500',
};
const MOMENTUM_TEXT: Record<string, string> = {
  Exploding: 'text-emerald-400',
  Accelerating: 'text-emerald-400',
  Scaling: 'text-teal-300',
  Emerging: 'text-amber-400',
  Dormant: 'text-gray-500',
};

function TrendChip({ status, count }: { status: ScoredAccount['trend_status']; count: number }) {
  if (status === 'trend_ready') {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500 ring-1 ring-emerald-500/25">
        Trend ✓ ({count})
      </span>
    );
  }
  if (status === 'tracking_started') {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-gray-500/10 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-400/25">
        Tracking
      </span>
    );
  }
  return null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function Favicon({ domain }: { domain: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[9px] font-bold uppercase text-gray-400">
        {domain.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={24}
      height={24}
      className="shrink-0 rounded-md bg-white/[0.06]"
      referrerPolicy="no-referrer"
      onError={() => setErr(true)}
    />
  );
}

// Persona-aware "why interesting" — server reason wins for 'other' or when
// the persona template comes back identical to the neutral fallback.
function rowReason(persona: Persona, a: ScoredAccount): string {
  if (persona === 'other' || !a.reason_inputs) return a.reason;
  const personaReason = buildPersonaReason(persona, a.reason_inputs);
  return personaReason === buildReason(a.reason_inputs) ? a.reason : personaReason;
}

// CRM stub popover — honest coming-soon state, no fake success.
function CrmPopover({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-2xl">
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-semibold text-gray-900">Push to CRM</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
          <XIcon width={13} height={13} />
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {CRM_PROVIDERS.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="text-[13px] font-medium text-gray-700">{p.label}</span>
            <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-gray-400 ring-1 ring-gray-300">
              Coming soon
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-gray-400">
        CRM sync is coming — Salesforce and HubSpot first. This account&rsquo;s score, momentum, and
        outbound angle will sync to your pipeline.
      </p>
    </div>
  );
}

type SortKey = 'score' | 'momentum' | 'updated';

export default function MyAccountsView({ onOpenReport }: { onOpenReport: (domain: string) => void }) {
  const { user } = useAuth();
  const uid = user?.id;
  const [persona] = usePersona();

  const [domains, setDomains] = useState<string[] | null>(null); // null = loading the saved set
  const [accounts, setAccounts] = useState<ScoredAccount[] | null>(null);
  const [pendingDomains, setPendingDomains] = useState<string[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [alerts, setAlerts] = useState<GrowthAlert[] | null>(null);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [capNotice, setCapNotice] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [csvInfo, setCsvInfo] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDesc, setSortDesc] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [crmOpenFor, setCrmOpenFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scoreReq = useRef(0);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  const score = useCallback(async (list: string[]) => {
    if (list.length === 0) {
      setAccounts([]);
      setPendingDomains([]);
      return;
    }
    const id = ++scoreReq.current;
    setScoring(true);
    setError(null);
    try {
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: list.slice(0, MAX_DOMAINS) }),
        signal: AbortSignal.timeout(30_000),
      });
      const d = await r.json().catch(() => ({}));
      if (id !== scoreReq.current) return;
      if (!r.ok) {
        setError(d.error || 'Scoring failed — please try again.');
        return;
      }
      setAccounts(Array.isArray(d.accounts) ? d.accounts : []);
      setPendingDomains(Array.isArray(d.pending) ? d.pending : []);
      setInvalidCount(typeof d.invalid === 'number' ? d.invalid : 0);
    } catch (e) {
      if (id !== scoreReq.current) return;
      setError(
        e instanceof Error && e.name === 'TimeoutError'
          ? 'Scoring took too long — please try again.'
          : 'Network error — please try again.'
      );
    } finally {
      if (id === scoreReq.current) setScoring(false);
    }
  }, []);

  const loadAlerts = useCallback(async (list: string[]) => {
    if (list.length === 0) {
      setAlerts([]);
      return;
    }
    try {
      const r = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: list.slice(0, MAX_DOMAINS) }),
        signal: AbortSignal.timeout(30_000),
      });
      const d = await r.json().catch(() => ({}));
      setAlerts(r.ok && Array.isArray(d.alerts) ? d.alerts : []);
    } catch {
      setAlerts([]); // alerts are a bonus strip — fail quiet, table still works
    }
  }, []);

  // Initial load: merge localStorage + watchlist 'My Accounts', then score.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const merged = await loadMyAccountDomains(uid);
      if (cancelled) return;
      setDomains(merged);
      if (merged.length > 0) {
        void score(merged);
        void loadAlerts(merged);
      } else {
        setAccounts([]);
        setAlerts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, score, loadAlerts]);

  async function persist(newDomains: string[]) {
    // localStorage first (never fails the flow), then watchlist best-effort.
    const existing = new Set(readStoredDomains(uid));
    const added = newDomains.filter((d) => !existing.has(d));
    writeStoredDomains(uid, [...new Set([...existing, ...newDomains])]);
    await Promise.allSettled(
      added.map((domain) =>
        fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain, brand_name: null, list_name: MY_ACCOUNTS_LIST }),
        })
      )
    );
  }

  async function importDomains(parsed: string[]) {
    setImportError(null);
    setCapNotice(null);
    if (parsed.length === 0) {
      setImportError('No valid domains found — expected one domain per line, comma separated, or a CSV with a domain column.');
      return;
    }
    let list = [...new Set([...(domains ?? []), ...parsed])];
    if (list.length > MAX_DOMAINS) {
      setCapNotice(`Capped at ${MAX_DOMAINS} accounts — ${list.length - MAX_DOMAINS} not imported.`);
      list = list.slice(0, MAX_DOMAINS);
    }
    setDomains(list);
    setPasteText('');
    setCsvInfo(null);
    setShowImport(false);
    void persist(list);
    void score(list);
    void loadAlerts(list);
  }

  function handleCsv(file: File) {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseDomainsCsv(String(reader.result ?? ''));
      if (parsed.length === 0) {
        setCsvInfo(null);
        setImportError('No domains found in that CSV — expected the first column or a column named domain/website/url.');
        return;
      }
      const capped = parsed.slice(0, MAX_DOMAINS);
      setCsvInfo(
        `${capped.length} domain${capped.length === 1 ? '' : 's'} found in ${file.name}` +
          (parsed.length > MAX_DOMAINS ? ` (capped at ${MAX_DOMAINS})` : '')
      );
      setPasteText(capped.join('\n'));
    };
    reader.onerror = () => setImportError('Could not read that file.');
    reader.readAsText(file);
  }

  async function copyText(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(msg);
    } catch {
      flash('Copy failed');
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((v) => !v);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const sorted = useMemo(() => {
    const rows = [...(accounts ?? [])];
    const dir = sortDesc ? -1 : 1;
    rows.sort((a, b) => {
      let av = 0;
      let bv = 0;
      if (sortKey === 'score') {
        av = a.growth_score ?? -1;
        bv = b.growth_score ?? -1;
      } else if (sortKey === 'momentum') {
        av = MOMENTUM_ORDER[a.growth_momentum ?? ''] ?? 0;
        bv = MOMENTUM_ORDER[b.growth_momentum ?? ''] ?? 0;
      } else {
        av = a.last_enriched_at ? new Date(a.last_enriched_at).getTime() : 0;
        bv = b.last_enriched_at ? new Date(b.last_enriched_at).getTime() : 0;
      }
      return av === bv ? a.domain.localeCompare(b.domain) : (av - bv) * dir;
    });
    return rows;
  }, [accounts, sortKey, sortDesc]);

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : '');
  const loadingSet = domains == null;
  const hasAccounts = (domains?.length ?? 0) > 0;

  const importPanel = (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Import accounts
      </div>
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder="Paste domains — one per line or comma separated"
        rows={4}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleCsv(f);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:border-indigo-400 hover:text-gray-900"
        >
          <UploadIcon width={13} height={13} />
          Upload CSV
        </button>
        {csvInfo && <span className="text-[11px] text-gray-400">{csvInfo}</span>}
        <button
          onClick={() => importDomains(parseDomainText(pasteText))}
          disabled={!pasteText.trim() || scoring}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          <SparkleIcon width={14} height={14} />
          Score accounts
        </button>
      </div>
      {importError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-600">
          {importError}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Accounts</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Your book of business, scored by growth — see which accounts are moving right now.
          </p>
        </div>
        {hasAccounts && (
          <button
            onClick={() => setShowImport((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
          >
            <UploadIcon width={13} height={13} />
            {showImport ? 'Hide import' : 'Add accounts'}
          </button>
        )}
      </div>

      {capNotice && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
          {capNotice}
        </div>
      )}

      {loadingSet ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !hasAccounts ? (
        <>
          <div className="rounded-2xl border border-gray-200 bg-white">
            <EmptyState
              icon={<BuildingIcon width={18} height={18} />}
              title="Monitor your book of business"
              body="Paste or upload the accounts you own and Tambourine will tell you which ones are growing right now."
            />
          </div>
          {importPanel}
        </>
      ) : (
        <>
          {showImport && importPanel}

          {/* Alerts strip */}
          {alerts == null ? (
            <Skeleton className="h-14 w-full" />
          ) : alerts.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <BellIcon width={12} height={12} />
                Growth alerts
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {alerts.map((a, i) => (
                  <AlertCard key={`${a.domain}-${a.type}-${i}`} alert={a} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-gray-400">{ALERTS_EMPTY_COPY}</p>
          )}

          {/* Pending domains */}
          {pendingDomains.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-amber-700">
                <ClockIcon width={14} height={14} />
                {pendingDomains.length} account{pendingDomains.length === 1 ? '' : 's'} queued — they&rsquo;ll
                score after tonight&rsquo;s data pull.
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pendingDomains.map((d) => (
                  <span key={d} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {invalidCount > 0 && (
            <p className="text-[11px] text-gray-400">
              {invalidCount} invalid domain{invalidCount === 1 ? '' : 's'} skipped.
            </p>
          )}

          {/* Table */}
          {scoring ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <span>{error}</span>
              <button
                onClick={() => {
                  void score(domains ?? []);
                  void loadAlerts(domains ?? []);
                }}
                className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Retry
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white">
              <EmptyState
                compact
                icon={<ClockIcon width={16} height={16} />}
                title="Nothing scored yet"
                body={
                  pendingDomains.length > 0
                    ? 'All of your imported accounts are queued — scores land after tonight’s data pull.'
                    : 'Import accounts above to score your book of business.'
                }
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="max-h-[68vh] overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      <th className="min-w-[180px] px-4 py-2.5">Company</th>
                      <th className="px-3 py-2.5 text-right">
                        <button onClick={() => toggleSort('score')} className="uppercase tracking-wider hover:text-gray-900">
                          Score{sortArrow('score')}
                        </button>
                      </th>
                      <th className="hidden px-3 py-2.5 lg:table-cell">
                        <button onClick={() => toggleSort('momentum')} className="uppercase tracking-wider hover:text-gray-900">
                          Momentum{sortArrow('momentum')}
                        </button>
                      </th>
                      <th className="px-3 py-2.5 text-right">Growth Investment</th>
                      <th className="hidden min-w-[240px] px-3 py-2.5 lg:table-cell">Why interesting</th>
                      <th className="px-2 py-2.5">Trend</th>
                      <th className="hidden px-3 py-2.5 text-right xl:table-cell">
                        <button onClick={() => toggleSort('updated')} className="uppercase tracking-wider hover:text-gray-900">
                          Updated{sortArrow('updated')}
                        </button>
                      </th>
                      <th className="w-[110px] px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sorted.map((a) => (
                      <tr key={a.domain} className="group transition-colors hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Favicon domain={a.domain} />
                            <div className="min-w-0">
                              <div className="truncate font-semibold capitalize text-gray-900">
                                {a.company_name || a.domain.replace(/^www\./, '').split('.')[0]}
                              </div>
                              <div className="truncate text-[11px] text-gray-400">{a.domain}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-400 ring-1 ring-emerald-500/20">
                            {a.growth_score ?? '—'}
                          </span>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2.5 lg:table-cell">
                          {a.growth_momentum ? (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${MOMENTUM_TEXT[a.growth_momentum] ?? 'text-gray-400'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${MOMENTUM_DOT[a.growth_momentum] ?? 'bg-gray-500'}`} />
                              {a.growth_momentum}
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <SpendEstimateBadge estimate={a.spend_estimate} compact />
                        </td>
                        <td className="hidden max-w-[340px] px-3 py-2.5 text-[12px] leading-snug text-gray-500 lg:table-cell">
                          {rowReason(persona, a)}
                        </td>
                        <td className="px-2 py-2.5">
                          <TrendChip status={a.trend_status} count={a.snapshot_count} />
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-[11px] text-gray-400 xl:table-cell">
                          {relativeTime(a.last_enriched_at)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative flex items-center justify-end gap-0.5 text-gray-500">
                            <button
                              onClick={() => onOpenReport(a.domain)}
                              title="Open report"
                              className="rounded-md p-1.5 hover:bg-white/[0.06] hover:text-indigo-300"
                            >
                              <DocIcon width={14} height={14} />
                            </button>
                            <button
                              onClick={() => copyText(a.outbound_angle, 'Outbound angle copied')}
                              title="Copy outbound angle"
                              className="rounded-md p-1.5 hover:bg-white/[0.06] hover:text-indigo-300"
                            >
                              <CopyIcon width={14} height={14} />
                            </button>
                            <button
                              onClick={() => setCrmOpenFor((v) => (v === a.domain ? null : a.domain))}
                              title="Push to CRM"
                              className="rounded-md p-1.5 hover:bg-white/[0.06] hover:text-emerald-300"
                            >
                              <ExternalLinkIcon width={14} height={14} />
                            </button>
                            {crmOpenFor === a.domain && <CrmPopover onClose={() => setCrmOpenFor(null)} />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-800 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
