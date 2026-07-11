'use client';

import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { AuthBackdrop } from '@/app/components/AuthScreen';

// Graceful degradation: without the Clerk publishable key this route must not
// crash — auth is simply off, so send folks back to the app.
const AUTH_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignInPage() {
  return (
    <AuthBackdrop>
      {AUTH_ENABLED ? (
        <div className="flex justify-center">
          <SignIn
            path="/sign-in"
            routing="path"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/"
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-[#101218] p-6 text-center shadow-2xl shadow-black/50">
          <p className="text-sm text-gray-300">
            Authentication isn’t configured in this deployment — no sign-in needed.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-indigo-300 hover:text-indigo-200"
          >
            Go to the app →
          </Link>
        </div>
      )}
    </AuthBackdrop>
  );
}
