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

// master_database domains are stored inconsistently (bare, www., http(s)://,
// trailing slash). Build the set of common exact forms to match against — exact
// match avoids the substring false-positives an ILIKE would risk.
export function domainCandidates(input: string): string[] {
  const bare = normalizeDomain(input);
  const prefixes = ['', 'www.', 'http://', 'https://', 'http://www.', 'https://www.'];
  const set = new Set<string>();
  for (const p of prefixes) {
    set.add(p + bare);
    set.add(p + bare + '/');
  }
  set.add(input.trim());
  return [...set];
}

export function extractRootDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  return parts.slice(-2).join('.');
}
