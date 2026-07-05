// Sanitize user text for PostgREST .ilike() filters: strip filter-grammar
// characters (, ( ) * break out of the filter value), escape LIKE wildcards,
// and cap length so wildcard scans can't be weaponized.
export function escapeIlike(input: string, maxLen = 100): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[,()*]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, (m) => `\\${m}`)
    .slice(0, maxLen);
}
