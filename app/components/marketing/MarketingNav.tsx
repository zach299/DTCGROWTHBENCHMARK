'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BoltIcon, BarsIcon, XIcon } from '@/app/components/icons';
import { NAV_LINKS } from '@/lib/marketingData';

const DEMO_HREF =
  'mailto:zach@tambourinegrowth.com?subject=' + encodeURIComponent('Tambourine demo');

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Tambourine home">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-900/40">
        <BoltIcon width={14} height={14} />
      </span>
      <span className="text-sm font-semibold tracking-tight text-white">Tambourine</span>
    </Link>
  );
}

export default function MarketingNav({ variant = 'full' }: { variant?: 'full' | 'lead' }) {
  const [open, setOpen] = useState(false);

  const links =
    variant === 'full' ? NAV_LINKS : [{ label: 'How it works', href: '#how' } as const];

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-4xl items-center justify-between gap-3 rounded-full border border-white/10 bg-[#11131c]/80 py-2 pl-4 pr-2 shadow-lg shadow-black/40 backdrop-blur-md"
      >
        <Wordmark />

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              title={'comingSoon' in l && l.comingSoon ? 'Coming soon' : undefined}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/sign-in"
            className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-gray-300 transition-colors hover:text-white"
          >
            Log in
          </Link>
          {variant === 'full' && (
            <a
              href={DEMO_HREF}
              className="rounded-full bg-[#7c6ef5] px-4 py-1.5 text-[13px] font-semibold text-white shadow-md shadow-indigo-900/50 transition-colors hover:bg-[#8b7cf7]"
            >
              Book a demo
            </a>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-300 hover:bg-white/5 hover:text-white md:hidden"
        >
          {open ? <XIcon width={16} height={16} /> : <BarsIcon width={16} height={16} />}
        </button>
      </nav>

      {/* Mobile sheet */}
      {open && (
        <div className="mx-auto mt-2 max-w-4xl rounded-2xl border border-white/10 bg-[#11131c]/95 p-3 shadow-xl shadow-black/50 backdrop-blur-md md:hidden">
          <div className="flex flex-col">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                title={'comingSoon' in l && l.comingSoon ? 'Coming soon' : undefined}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-3">
              <Link
                href="/sign-in"
                className="flex-1 rounded-full border border-white/10 px-4 py-2 text-center text-sm font-medium text-gray-200 hover:bg-white/5"
              >
                Log in
              </Link>
              {variant === 'full' && (
                <a
                  href={DEMO_HREF}
                  className="flex-1 rounded-full bg-[#7c6ef5] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#8b7cf7]"
                >
                  Book a demo
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
