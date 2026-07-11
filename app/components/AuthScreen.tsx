'use client';

// Full-screen marketing gate shown by app/page.tsx when auth is enabled and
// there is no session. Sign-in/up themselves happen on the dedicated Clerk
// routes (/sign-in, /sign-up). When authEnabled is false this screen never
// renders — the gate in Home() passes straight through to the app.

import Link from 'next/link';
import { BoltIcon } from '@/app/components/icons';

/**
 * Shared dark radial-glow backdrop + Tambourine brand header, reused by the
 * /sign-in and /sign-up routes so all auth surfaces look identical.
 */
export function AuthBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{
        background:
          'radial-gradient(600px 320px at 50% 8%, rgba(124, 108, 247, 0.16), transparent 70%), radial-gradient(900px 500px at 50% 0%, rgba(99, 102, 241, 0.09), transparent 75%), #0a0b10',
      }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-900/50">
              <BoltIcon width={19} height={19} />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Tambourine</span>
          </div>
          <p className="mt-3 text-sm text-gray-400">Find your fastest-growing TAM.</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AuthScreen() {
  return (
    <AuthBackdrop>
      <div className="rounded-2xl border border-white/10 bg-[#101218] p-6 text-center shadow-2xl shadow-black/50">
        <p className="text-sm leading-relaxed text-gray-300">
          Growth intelligence on 60,000+ ecommerce brands.
        </p>
        <div className="mt-5 space-y-2.5">
          <Link
            href="/sign-up"
            className="flex w-full items-center justify-center rounded-lg bg-[#7c6ef5] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-[#8b7cf7]"
          >
            Create free account
          </Link>
          <Link
            href="/sign-in"
            className="flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-indigo-500/40 hover:bg-white/[0.06]"
          >
            Sign in
          </Link>
        </div>
        <Link
          href="/lookup"
          className="mt-5 inline-block text-xs font-medium text-gray-400 transition hover:text-gray-200"
        >
          Or try a free brand lookup first →
        </Link>
      </div>
      <p className="mt-6 text-center text-[11px] text-gray-500">
        By continuing you agree to the Tambourine terms.
      </p>
    </AuthBackdrop>
  );
}
