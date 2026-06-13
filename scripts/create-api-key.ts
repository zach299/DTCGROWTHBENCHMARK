#!/usr/bin/env tsx
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateApiKey, hashApiKey } from '../lib/auth/apiKey';

async function main() {
  const args = process.argv.slice(2);
  const accountNameIdx = args.indexOf('--account-name');
  const accountName = accountNameIdx !== -1 ? args[accountNameIdx + 1] : 'Default Account';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Create account
  const { data: account, error: accountErr } = await supabase
    .from('accounts')
    .insert({ name: accountName })
    .select('id')
    .single();

  if (accountErr || !account) {
    console.error('Failed to create account:', accountErr?.message);
    process.exit(1);
  }

  const key = generateApiKey();
  const hash = hashApiKey(key);

  const { error: keyErr } = await supabase.from('api_keys').insert({
    account_id: account.id,
    key_hash: hash,
    label: `${accountName} key`,
    is_active: true,
  });

  if (keyErr) {
    console.error('Failed to create API key:', keyErr.message);
    process.exit(1);
  }

  console.log('\n=== API Key Created ===');
  console.log(`Account: ${accountName} (${account.id})`);
  console.log(`API Key: ${key}`);
  console.log('\nStore this key securely. It cannot be retrieved again.');
  console.log('Use it as: x-api-key: ' + key);
}

main().catch(console.error);
