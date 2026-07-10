// CRM push interface — UI-facing contract for Salesforce/HubSpot sync.
//
// Status: interface + stub only (documented in TODO.md). Real integrations
// need per-provider OAuth (connected-app / private-app tokens), field mapping,
// and a server-side token store — out of scope for this run. The UI renders
// providers from this registry so wiring a real one is a drop-in.

export interface CrmProvider {
  id: 'salesforce' | 'hubspot';
  label: string;
  status: 'coming_soon';
}

export const CRM_PROVIDERS: CrmProvider[] = [
  { id: 'salesforce', label: 'Salesforce', status: 'coming_soon' },
  { id: 'hubspot', label: 'HubSpot', status: 'coming_soon' },
];

export interface CrmPushPayload {
  domain: string;
  company_name: string | null;
  growth_score: number | null;
  growth_momentum: string | null;
  reason: string;
  outbound_angle?: string | null;
}

/** Drop-in point for a real integration. Currently always unavailable. */
export async function pushToCrm(
  _provider: CrmProvider['id'],
  _payload: CrmPushPayload
): Promise<{ ok: false; reason: 'not_connected' }> {
  return { ok: false, reason: 'not_connected' };
}
