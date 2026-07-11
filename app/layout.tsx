import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { AuthProvider } from '@/app/components/AuthProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Tambourine — Find your fastest-growing TAM',
  description:
    'Tambourine helps GTM teams find and monitor growing accounts using live growth signals — market momentum, growth investment, revenue scale, and expansion activity.',
};

// When Clerk isn't configured the app must run exactly as it did without
// auth — no ClerkProvider, no login wall, no crash.
const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const clerkAppearance = {
  variables: {
    colorPrimary: '#7c6ef5',
    colorBackground: '#101218',
    colorText: '#edeef5',
    colorInputBackground: 'rgba(255,255,255,0.04)',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const app = <AuthProvider>{children}</AuthProvider>;
  return (
    <html lang="en">
      <body className={inter.className}>
        {CLERK_ENABLED ? (
          <ClerkProvider appearance={clerkAppearance}>{app}</ClerkProvider>
        ) : (
          app
        )}
      </body>
    </html>
  );
}
