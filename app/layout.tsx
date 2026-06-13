import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Growth Signals',
  description: 'Ecommerce brand GTM intelligence',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="border-b border-gray-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" className="font-bold text-gray-900">Growth Signals</a>
            <div className="flex gap-6 text-sm text-gray-600">
              <a href="/" className="hover:text-gray-900">Lookup</a>
              <a href="/admin/imports" className="hover:text-gray-900">Imports</a>
              <a href="/admin/jobs" className="hover:text-gray-900">Jobs</a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
