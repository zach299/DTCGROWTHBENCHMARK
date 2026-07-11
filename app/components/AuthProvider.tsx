'use client';

import { createContext, useContext, useMemo } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';

// Minimal user shape consumed across the app (usePersona, TamListBuilder,
// MyAccountsView, SettingsView, sidebar footer) — only .id and .email are used.
export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** False when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY isn't configured — the app runs without login. */
  authEnabled: boolean;
  signOut: () => Promise<void>;
}

// Evaluated at build time (NEXT_PUBLIC_ envs are inlined). When the key is
// absent the app must run exactly as before auth existed: no login wall,
// no Clerk hooks, no crash.
const AUTH_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const DISABLED_VALUE: AuthContextValue = {
  user: null,
  loading: false,
  authEnabled: false,
  signOut: async () => {},
};

const AuthContext = createContext<AuthContextValue>(DISABLED_VALUE);

// Clerk hooks may only be called under <ClerkProvider>, which layout.tsx only
// mounts when the publishable key is set — so this inner component is only
// rendered in that case.
function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { user: clerkUser, isLoaded } = useUser();
  const clerk = useClerk();

  const value = useMemo<AuthContextValue>(
    () => ({
      user: clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress ?? '' }
        : null,
      loading: !isLoaded,
      authEnabled: true,
      signOut: async () => {
        await clerk.signOut();
      },
    }),
    [clerkUser, isLoaded, clerk],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!AUTH_ENABLED) {
    // Auth env vars not configured — never block the app.
    return <AuthContext.Provider value={DISABLED_VALUE}>{children}</AuthContext.Provider>;
  }
  return <ClerkAuthBridge>{children}</ClerkAuthBridge>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
