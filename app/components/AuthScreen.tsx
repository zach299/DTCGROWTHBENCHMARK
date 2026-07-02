'use client';

// Full-screen premium dark login. Shown by app/page.tsx when there is no
// Supabase session. Supports password sign-in, account creation, and
// passwordless magic links.

import { useState } from 'react';
import { BoltIcon } from '@/app/components/icons';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup';
type Sent = { kind: 'magic' | 'confirm'; email: string } | null;

function humanError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'That email and password don’t match. Check for typos, or use a magic link instead.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts — give it a minute, then try again.';
  }
  if (m.includes('already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (m.includes('password should be')) {
    return 'Passwords need at least 6 characters.';
  }
  if (m.includes('email not confirmed')) {
    return 'Your email hasn’t been confirmed yet. Check your inbox for the confirmation link.';
  }
  if (m.includes('valid email')) {
    return 'That doesn’t look like a valid email address.';
  }
  return message;
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [magicSubmitting, setMagicSubmitting] = useState(false);
  const [sent, setSent] = useState<Sent>(null);

  const busy = submitting || magicSubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setSubmitting(true);
    const supabase = getSupabaseBrowserClient();
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) setError(humanError(err.message));
        // On success, AuthProvider's onAuthStateChange swaps in the app.
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) {
          setError(humanError(err.message));
        } else if (!data.session && data.user && (data.user.identities?.length ?? 0) > 0) {
          // Email confirmation required before a session is issued.
          setSent({ kind: 'confirm', email: email.trim() });
        } else if (!data.session && data.user && data.user.identities?.length === 0) {
          setError('An account with this email already exists. Try signing in instead.');
        }
      }
    } catch {
      setError('Something went wrong reaching the sign-in service. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMagicLink() {
    if (busy) return;
    setError(null);
    if (!email.trim()) {
      setError('Enter your email above first, then we can send you a magic link.');
      return;
    }
    setMagicSubmitting(true);
    const supabase = getSupabaseBrowserClient();
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (err) setError(humanError(err.message));
      else setSent({ kind: 'magic', email: email.trim() });
    } catch {
      setError('Something went wrong sending the link. Please try again.');
    } finally {
      setMagicSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/30';

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{
        background:
          'radial-gradient(600px 320px at 50% 8%, rgba(124, 108, 247, 0.16), transparent 70%), radial-gradient(900px 500px at 50% 0%, rgba(99, 102, 241, 0.09), transparent 75%), #0a0b10',
      }}
    >
      <div className="w-full max-w-[400px]">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-900/50">
              <BoltIcon width={19} height={19} />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Tambourine</span>
          </div>
          <p className="mt-3 text-sm text-gray-400">Find your fastest-growing TAM.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#101218] p-6 shadow-2xl shadow-black/50">
          {sent ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-white">
                {sent.kind === 'magic' ? 'Check your email' : 'Confirm your account'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {sent.kind === 'magic'
                  ? 'We sent you a sign-in link. Open it on this device and you’ll be signed in automatically.'
                  : 'Check your email to confirm your account, then come back here to sign in.'}
              </p>
              <p className="mt-2 text-sm font-medium text-indigo-300">{sent.email}</p>
              <button
                type="button"
                onClick={() => setSent(null)}
                className="mt-5 text-xs font-medium text-gray-500 transition hover:text-gray-300"
              >
                ← Back to sign in
              </button>
            </div>
          ) : (
            <>
              {/* Mode toggle */}
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-1 ring-1 ring-white/5">
                {(
                  [
                    ['signin', 'Sign in'],
                    ['signup', 'Create account'],
                  ] as [Mode, string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setError(null);
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      mode === m
                        ? 'bg-indigo-500/20 text-white ring-1 ring-inset ring-indigo-500/40'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="auth-email"
                    className="mb-1.5 block text-xs font-medium text-gray-400"
                  >
                    Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="auth-password"
                    className="mb-1.5 block text-xs font-medium text-gray-400"
                  >
                    Password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                    className={inputClass}
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-red-300"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7c6ef5] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-[#8b7cf7] disabled:opacity-60"
                >
                  {submitting && <Spinner />}
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  or
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <button
                type="button"
                onClick={handleMagicLink}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-indigo-500/40 hover:bg-white/[0.06] disabled:opacity-60"
              >
                {magicSubmitting && <Spinner />}
                Email me a magic link
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-gray-600">
          By continuing you agree to the Tambourine terms.
        </p>
      </div>
    </div>
  );
}
