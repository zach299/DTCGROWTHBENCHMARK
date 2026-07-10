'use client';

// Alerts — full-page growth alerts across the rep's My Accounts set plus
// every watchlist domain. Same alert cards and empty-state copy as the
// MyAccountsView strip; computed on read from /api/alerts.

import { useCallback, useEffect, useState } from 'react';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import { useAuth } from './AuthProvider';
import { BellIcon } from './icons';
import { loadMyAccountDomains } from './myAccounts';
import { AlertCard, ALERTS_EMPTY_COPY, type GrowthAlert } from './MyAccountsView';

export default function AlertsView({ onOpenMyAccounts }: { onOpenMyAccounts: () => void }) {
  const { user } = useAuth();
  const uid = user?.id;
  const [alerts, setAlerts] = useState<GrowthAlert[] | null>(null);
  const [checked, setChecked] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setAlerts(null);
    setError(null);
    try {
      // My Accounts set (localStorage + watchlist 'My Accounts') ∪ all watchlist domains.
      const domains = new Set(await loadMyAccountDomains(uid));
      try {
        const r = await fetch('/api/watchlist', { signal: AbortSignal.timeout(15_000) });
        if (r.ok) {
          const d = await r.json();
          for (const it of Array.isArray(d.items) ? d.items : []) {
            if (it?.domain) domains.add(it.domain as string);
          }
        }
      } catch {
        /* watchlist unavailable — My Accounts set still checked */
      }
      const list = [...domains].slice(0, 500);
      setChecked(list.length);
      if (list.length === 0) {
        setAlerts([]);
        return;
      }
      const r = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: list }),
        signal: AbortSignal.timeout(30_000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setAlerts(Array.isArray(d.alerts) ? d.alerts : []);
    } catch {
      setError('Couldn’t load alerts — please try again.');
      setAlerts([]);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Alerts</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Growth alerts across your accounts and watchlists
          {checked > 0 ? ` · ${checked} domain${checked === 1 ? '' : 's'} checked` : ''}.
        </p>
      </div>

      {alerts == null ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button
            onClick={() => void load()}
            className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={<BellIcon width={18} height={18} />}
            title={checked === 0 ? 'Nothing to watch yet' : 'No growth alerts yet'}
            body={
              checked === 0
                ? 'Import your book of business under My Accounts (or save accounts to a watchlist) and alerts will watch them for you.'
                : ALERTS_EMPTY_COPY
            }
            action={
              checked === 0 ? (
                <button
                  onClick={onOpenMyAccounts}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Import accounts
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {alerts.map((a, i) => (
            <AlertCard key={`${a.domain}-${a.type}-${i}`} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}
