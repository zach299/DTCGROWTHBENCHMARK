'use client';

import { useEffect, useRef } from 'react';
import ParticleField from './ParticleField';
import MarketingNav from './MarketingNav';
import GrowthTicker from './GrowthTicker';
import TopMoversCarousel from './TopMoversCarousel';
import {
  Hero,
  AISearchBar,
  QueryPills,
  StatStrip,
  SignalCoverage,
  UseCases,
  FinalCTA,
  Footer,
} from './sections';
import { TICKER_COMPANIES } from '@/lib/marketingData';

// Signed-out marketing homepage. Composes the marketing system on the dark
// premium surface; section reveals fade in as they enter the viewport
// (skipped under prefers-reduced-motion).

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('mk-revealed');
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('mk-revealed');
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`mk-reveal ${className}`}>
      {children}
    </div>
  );
}

export default function MarketingHome() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#08090f] text-gray-200">
      {/* Ambient layers */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] tam-hero-glow" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-[880px]">
        <ParticleField />
      </div>

      <MarketingNav variant="full" />

      <main className="relative">
        <div className="pt-36 sm:pt-44">
          <Hero />
          <AISearchBar />
          <QueryPills />
          <StatStrip />
        </div>

        <div className="mt-20 sm:mt-24">
          <GrowthTicker rows={2} entries={TICKER_COMPANIES} />
        </div>

        <Reveal className="mt-24 sm:mt-28">
          <TopMoversCarousel />
        </Reveal>

        <Reveal className="mt-24 sm:mt-32">
          <SignalCoverage />
        </Reveal>

        <Reveal className="mt-24 sm:mt-32">
          <UseCases />
        </Reveal>

        <Reveal className="mt-24 sm:mt-32">
          <FinalCTA />
        </Reveal>

        <div className="mt-20">
          <Footer />
        </div>
      </main>
    </div>
  );
}
