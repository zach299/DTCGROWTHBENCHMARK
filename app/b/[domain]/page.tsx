import type { Metadata } from 'next';
import PublicSnapshot from '@/app/components/PublicSnapshot';

// Public shareable brand snapshot — the outbound weapon. The server shell
// renders instantly; metering + data load client-side in PublicSnapshot.
export const dynamic = 'force-dynamic';

function cleanDomain(raw: string): string {
  const d = decodeURIComponent(raw)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
  // Keep only a plausible hostname; anything else falls back to the raw slug
  // stripped of unsafe chars so metadata/text can never carry markup.
  return /^[a-z0-9][a-z0-9.-]*$/.test(d) ? d : d.replace(/[^a-z0-9.-]/g, '');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  const d = cleanDomain(domain);
  return {
    title: `${d} growth report — Tambourine`,
    description: `Live growth signals for ${d}: growth score, momentum, estimated growth investment, and hiring — scored in seconds by Tambourine.`,
  };
}

export default async function BrandSnapshotPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  return <PublicSnapshot domain={cleanDomain(domain)} />;
}
