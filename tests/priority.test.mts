import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordPriorityView } from '../lib/priority.ts';

function stub(behavior: 'ok' | 'error' | 'throw') {
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      from: (table: string) => ({
        upsert: async (row: unknown, opts: unknown) => {
          calls.push({ table, row, opts });
          if (behavior === 'throw') throw new Error('network down');
          return { error: behavior === 'error' ? { message: 'rls denied' } : null };
        },
      }),
    } as never,
  };
}

test('viewed brand is recorded with conflict-safe upsert', async () => {
  const { client, calls } = stub('ok');
  const ok = await recordPriorityView(client, 'ruggable.com');
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  const c = calls[0] as { table: string; row: { domain: string; last_viewed_at: string }; opts: { onConflict: string } };
  assert.equal(c.table, 'domain_priority');
  assert.equal(c.row.domain, 'ruggable.com');
  assert.ok(!Number.isNaN(Date.parse(c.row.last_viewed_at)));
  assert.equal(c.opts.onConflict, 'domain');
});

test('supabase error is swallowed — page load never breaks on view tracking', async () => {
  const { client } = stub('error');
  await assert.doesNotReject(() => recordPriorityView(client, 'x.com'));
  assert.equal(await recordPriorityView(client, 'x.com'), false);
});

test('thrown network error is swallowed too', async () => {
  const { client } = stub('throw');
  assert.equal(await recordPriorityView(client, 'x.com'), false);
});
