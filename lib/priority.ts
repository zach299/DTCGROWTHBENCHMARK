import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './utils/logger.ts';

/**
 * Record that a brand was viewed/searched so the nightly worker refreshes it
 * within 24h. AWAITED by callers (serverless freezes un-awaited writes), but
 * explicitly best-effort: view tracking must never break a product response.
 * Returns true when the view was persisted.
 */
export async function recordPriorityView(
  supabase: SupabaseClient,
  domain: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('domain_priority')
      .upsert({ domain, last_viewed_at: new Date().toISOString() }, { onConflict: 'domain' });
    if (error) {
      logger.error('priority view record failed', { domain, error: error.message });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('priority view record threw', {
      domain,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
