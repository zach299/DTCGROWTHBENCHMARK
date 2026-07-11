import type { Metadata } from 'next';
import LeadMagnet from '@/app/components/marketing/LeadMagnet';

// Lead-magnet lookup page — the cold-outbound / paid / SEO landing surface.
// One job: get a visitor to run a company lookup and convert on the report.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'See how fast any company is growing — Tambourine',
  description:
    'Enter a company to see its Growth Score, advertising momentum, hiring activity, traffic trends, and technology signals — scored in seconds, free.',
};

export default async function CompanyGrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : undefined;
  return <LeadMagnet initialQuery={q} />;
}
