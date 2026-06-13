import { createHash, randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): string {
  return `gsa_${randomBytes(32).toString('hex')}`;
}

export async function validateApiKey(key: string): Promise<{ valid: boolean; accountId?: string }> {
  if (!key) return { valid: false };
  const hash = hashApiKey(key);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, account_id, is_active')
    .eq('key_hash', hash)
    .single();

  if (error || !data || !data.is_active) return { valid: false };

  // Update last_used_at asynchronously (fire and forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return { valid: true, accountId: data.account_id };
}
