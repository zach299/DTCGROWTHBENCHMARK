'use client';

// /lookup — the PLG funnel's public analyzer. One job: type a brand, hit the
// aha moment in seconds. Metering happens here (POST /api/lookup); allowed
// lookups continue to /b/{domain}, blocked ones hit the signup wall.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PublicTopBar, WallPanel } from '@/app/components/PublicSnapshot';
import { SearchIcon } from '@/app/components/icons';

const EXAMPLES = ['ruggable.com', 'gymshark.com', 'jonesroadbeauty.com'];

function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
}

type Wall = { kind: 'signup_required' } | { kind: 'daily_limit'; limit: number };

export default function LookupPage() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wall, setWall] = useState<Wall | null>(null);

  async function submit(raw: string) {
    const domain = normalize(raw);
    if (!domain || submitting) return;
    setValue(domain);
    setSubmitting(true);
    setError(null);
    setWall(null);
    try {
      const r = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
        signal: AbortSignal.timeout(15_000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof d.error === 'string' ? d.error : 'Enter a valid brand domain, like ruggable.com');
        setSubmitting(false);
        return;
      }
      if (d.allowed) {
        router.push(`/b/${encodeURIComponent(d.domain ?? domain)}`);
        return; // keep the button in its loading state through navigation
      }
      setWall(
        d.reason === 'daily_limit'
          ? { kind: 'daily_limit', limit: Number(d.limit ?? 5) }
          : { kind: 'signup_required' }
      );
      setSubmitting(false);
    } catch {
      setError('Network hiccup — please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="dark-app min-h-screen bg-[#0a0b10]">
      <PublicTopBar />
      <main className="tam-hero-glow mx-auto max-w-3xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Is this brand <span className="tam-gradient-text">actually growing?</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-gray-400 sm:text-base">
            Paste any ecommerce brand’s URL. Tambourine reads its live growth signals — momentum,
            growth investment, hiring — and scores it in seconds. Free.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
          className="tam-prompt mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-2xl bg-[#101218] p-2 pl-4"
        >
          <SearchIcon width={16} height={16} className="shrink-0 text-gray-500" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="ruggable.com"
            autoFocus
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Brand domain"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-gray-100 outline-none placeholder:text-gray-600"
          />
          <button
            type="submit"
            disabled={submitting || !value.trim()}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? 'Analyzing…' : 'Analyze brand'}
          </button>
        </form>

        {error && (
          <p className="mt-3 text-center text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {EXAMPLES.map((d) => (
            <button
              key={d}
              onClick={() => submit(d)}
              disabled={submitting}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-white/[0.07] hover:text-gray-200 disabled:opacity-50"
            >
              {d}
            </button>
          ))}
        </div>
        <p className="mt-4 text-center text-[11px] text-gray-600">60,000+ brands tracked · updated daily</p>

        {wall && (
          <div className="mx-auto mt-10 max-w-xl">
            {wall.kind === 'daily_limit' ? (
              <WallPanel
                headline={`You’ve used today’s ${wall.limit} free lookups — resets at midnight UTC.`}
                sub="Your watchlists and alerts keep working in the dashboard while the counter resets."
              />
            ) : (
              <WallPanel
                headline="That’s your free look — create a free account to keep going."
                bullets={[
                  '5 free brand lookups a day',
                  'Growth score, momentum & growth-investment estimates',
                  'Alerts when accounts start exploding',
                ]}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
