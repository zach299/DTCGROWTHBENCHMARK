'use client';

// Shared "My Accounts" domain-set helpers — used by MyAccountsView and
// AlertsView so both resolve the same book of business. The set lives in two
// places: localStorage (fast, per-device, keyed by Supabase user id like the
// quota counters) and the watchlist under list_name 'My Accounts' (survives
// devices). Loaders merge both.

export const MY_ACCOUNTS_LIST = 'My Accounts';

export function myAccountsStorageKey(userId: string | null | undefined): string {
  return `${userId ?? 'anon'}:my_accounts_domains`;
}

export function readStoredDomains(userId: string | null | undefined): string[] {
  try {
    const raw = localStorage.getItem(myAccountsStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

export function writeStoredDomains(userId: string | null | undefined, domains: string[]): void {
  try {
    localStorage.setItem(myAccountsStorageKey(userId), JSON.stringify(domains));
  } catch {
    /* private mode — in-memory state still works */
  }
}

/** Merge localStorage domains with watchlist items under 'My Accounts'. */
export async function loadMyAccountDomains(userId: string | null | undefined): Promise<string[]> {
  const merged = new Set(readStoredDomains(userId));
  try {
    const r = await fetch('/api/watchlist', { signal: AbortSignal.timeout(15_000) });
    if (r.ok) {
      const d = await r.json();
      const items: { domain: string; list_name: string }[] = Array.isArray(d.items) ? d.items : [];
      for (const it of items) {
        if (it.list_name === MY_ACCOUNTS_LIST && it.domain) merged.add(it.domain);
      }
    }
  } catch {
    /* offline / API down — localStorage set still usable */
  }
  return [...merged];
}

/** Loosely normalize a pasted token into a bare domain (server re-validates). */
export function cleanDomainToken(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/^["']+|["']+$/g, '');
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/?#\s]/)[0].replace(/:\d+$/, '');
  if (!s.includes('.') || /\s/.test(s)) return null;
  return s;
}

/** Parse textarea input: one domain per line, or comma/whitespace separated. */
export function parseDomainText(text: string): string[] {
  const out = new Set<string>();
  for (const token of text.split(/[\n,;\t ]+/)) {
    const d = cleanDomainToken(token);
    if (d) out.add(d);
  }
  return [...out];
}

// Minimal CSV line splitter with quoted-cell support.
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

/**
 * Parse a CSV file's text: prefer a column whose header contains
 * domain/website/url; otherwise take the first column. Header row is skipped
 * when it doesn't look like a domain itself.
 */
export function parseDomainsCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  let col = header.findIndex((h) => h.includes('domain') || h.includes('website') || h.includes('url'));
  const hasHeader = col >= 0 || !cleanDomainToken(header[0] ?? '');
  if (col < 0) col = 0;
  const out = new Set<string>();
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const d = cleanDomainToken(splitCsvLine(line)[col] ?? '');
    if (d) out.add(d);
  }
  return [...out];
}
