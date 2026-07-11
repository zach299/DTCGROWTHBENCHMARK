import { redirect } from 'next/navigation';

// /lookup is superseded by the /company-growth lead-magnet experience.
// Preserve any incoming query (e.g. ?q= from the homepage search bar).
export const dynamic = 'force-dynamic';

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v);
    else if (Array.isArray(v)) for (const x of v) qs.append(k, x);
  }
  const suffix = qs.toString();
  redirect(`/company-growth${suffix ? `?${suffix}` : ''}`);
}
