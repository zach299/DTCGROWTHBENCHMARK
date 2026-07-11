// Server-side lookup metering — the PLG funnel's enforcement layer.
//
// Anonymous visitors: 1 free lookup (tracked by an httpOnly cookie id), then
// the signup wall. Free accounts: 5 lookups/day. Counters live in Supabase
// (lookup_usage, RLS default-deny) keyed by subject + date, so they can't be
// reset by clearing localStorage.
//
// Design note: consume() re-shows the SAME domain for free (repeat views of a
// report you already unlocked never burn quota) — critical for shared report
// links used in outbound.

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './utils/logger.ts';

export const ANON_FREE_LOOKUPS = 1;
export const FREE_DAILY_LOOKUPS = 5;

export interface QuotaState {
  allowed: boolean;
  remaining: number;
  limit: number;
  subject_kind: 'anon' | 'user';
  reason?: 'signup_required' | 'daily_limit';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Check-and-consume one lookup for `subject`. Repeat lookups of the same
 * domain on the same day are free. Fails OPEN on infrastructure errors —
 * a metering outage must never take down the product.
 */
export async function consumeLookup(
  supabase: SupabaseClient,
  subject: string,
  kind: 'anon' | 'user',
  domain: string
): Promise<QuotaState> {
  const limit = kind === 'anon' ? ANON_FREE_LOOKUPS : FREE_DAILY_LOOKUPS;
  const usage_date = today();
  try {
    const { data: row } = await supabase
      .from('lookup_usage')
      .select('lookups, last_domain')
      .eq('subject', subject)
      .eq('usage_date', usage_date)
      .maybeSingle();

    const used = Number(row?.lookups ?? 0);

    // Repeat view of the most recent domain — free (shared links, refreshes).
    if (row?.last_domain === domain) {
      return { allowed: true, remaining: Math.max(0, limit - used), limit, subject_kind: kind };
    }

    if (used >= limit) {
      return {
        allowed: false,
        remaining: 0,
        limit,
        subject_kind: kind,
        reason: kind === 'anon' ? 'signup_required' : 'daily_limit',
      };
    }

    const { error } = await supabase.from('lookup_usage').upsert(
      { subject, usage_date, lookups: used + 1, last_domain: domain, updated_at: new Date().toISOString() },
      { onConflict: 'subject,usage_date' }
    );
    if (error) throw error;

    return { allowed: true, remaining: Math.max(0, limit - used - 1), limit, subject_kind: kind };
  } catch (err) {
    logger.error('lookup quota failed open', {
      subject: subject.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, remaining: limit, limit, subject_kind: kind };
  }
}

/** Read-only peek at today's remaining quota (for UI badges). */
export async function peekLookupQuota(
  supabase: SupabaseClient,
  subject: string,
  kind: 'anon' | 'user'
): Promise<QuotaState> {
  const limit = kind === 'anon' ? ANON_FREE_LOOKUPS : FREE_DAILY_LOOKUPS;
  try {
    const { data: row } = await supabase
      .from('lookup_usage')
      .select('lookups')
      .eq('subject', subject)
      .eq('usage_date', today())
      .maybeSingle();
    const used = Number(row?.lookups ?? 0);
    return { allowed: used < limit, remaining: Math.max(0, limit - used), limit, subject_kind: kind };
  } catch {
    return { allowed: true, remaining: limit, limit, subject_kind: kind };
  }
}
