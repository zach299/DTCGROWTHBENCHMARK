export function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  // Strip protocol
  d = d.replace(/^https?:\/\//i, '');
  // Strip www.
  d = d.replace(/^www\./i, '');
  // Remove path, query, fragment
  const slashIdx = d.indexOf('/');
  if (slashIdx !== -1) d = d.slice(0, slashIdx);
  const queryIdx = d.indexOf('?');
  if (queryIdx !== -1) d = d.slice(0, queryIdx);
  const hashIdx = d.indexOf('#');
  if (hashIdx !== -1) d = d.slice(0, hashIdx);
  return d;
}

export function extractRootDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  return parts.slice(-2).join('.');
}
