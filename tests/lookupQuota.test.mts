import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeLookup, ANON_FREE_LOOKUPS, FREE_DAILY_LOOKUPS } from '../lib/lookupQuota.ts';

function stubDb(initial: { lookups: number; last_domain: string | null } | null, failOnUpsert = false) {
  const state = { row: initial, upserts: [] as unknown[] };
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) c[m] = () => c;
    c.maybeSingle = async () => ({ data: state.row });
    c.upsert = async (row: unknown) => {
      if (failOnUpsert) return { error: { message: 'db down' } };
      state.upserts.push(row);
      return { error: null };
    };
    return c;
  };
  return { state, client: { from: () => chain(null) } as never };
}

test('anonymous first lookup allowed, second blocked with signup_required', async () => {
  const fresh = stubDb(null);
  const first = await consumeLookup(fresh.client, 'anon:abc', 'anon', 'ruggable.com');
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, ANON_FREE_LOOKUPS - 1);

  const used = stubDb({ lookups: 1, last_domain: 'ruggable.com' });
  const second = await consumeLookup(used.client, 'anon:abc', 'anon', 'gymshark.com');
  assert.equal(second.allowed, false);
  assert.equal(second.reason, 'signup_required');
});

test('repeat view of the same domain never burns quota (shared links)', async () => {
  const used = stubDb({ lookups: 1, last_domain: 'ruggable.com' });
  const again = await consumeLookup(used.client, 'anon:abc', 'anon', 'ruggable.com');
  assert.equal(again.allowed, true);
  assert.equal(used.state.upserts.length, 0, 'no counter increment');
});

test('free user gets 5/day then daily_limit', async () => {
  const atLimit = stubDb({ lookups: FREE_DAILY_LOOKUPS, last_domain: 'x.com' });
  const blocked = await consumeLookup(atLimit.client, 'user:u1', 'user', 'y.com');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'daily_limit');

  const midway = stubDb({ lookups: 2, last_domain: 'x.com' });
  const ok = await consumeLookup(midway.client, 'user:u1', 'user', 'y.com');
  assert.equal(ok.allowed, true);
  assert.equal(ok.remaining, FREE_DAILY_LOOKUPS - 3);
});

test('fails OPEN when the metering store errors', async () => {
  const broken = stubDb(null, true);
  const r = await consumeLookup(broken.client, 'user:u1', 'user', 'z.com');
  assert.equal(r.allowed, true);
});
