import { test } from 'node:test';
import assert from 'node:assert/strict';

test('missing Supabase env vars → client is null, auth reports disabled, no throw', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const mod = await import('../lib/supabase/client.ts');
  assert.equal(mod.isAuthConfigured(), false);
  assert.doesNotThrow(() => mod.getSupabaseBrowserClient());
  assert.equal(mod.getSupabaseBrowserClient(), null);
});

test('with env vars set → client is created and cached', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  // cache-bust the module so the singleton re-evaluates with the new env
  const mod = await import('../lib/supabase/client.ts?v=2' as string);
  assert.equal(mod.isAuthConfigured(), true);
  const a = mod.getSupabaseBrowserClient();
  const b = mod.getSupabaseBrowserClient();
  assert.ok(a);
  assert.equal(a, b, 'singleton');
});
