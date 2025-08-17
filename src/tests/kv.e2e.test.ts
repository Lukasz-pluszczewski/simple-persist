import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mountKV, render, cleanup, screen, waitFor } from './reactHarness';
import { createTestServer } from './testServer';

describe.skip('KeyValue E2E', () => {
  let srv: Awaited<ReturnType<typeof createTestServer>>;

  beforeAll(async () => {
    srv = await createTestServer();
  });

  afterAll(async () => {
    await srv.close();
    cleanup();
  });

  it('initially returns empty map and updates via setKey', async () => {
    mountKV(srv.baseURL, 't1');

    const pre = await screen.findByTestId('kv-t1');
    await waitFor(() => expect(pre.textContent).toBe('{}'));

    // setKey through HTTP to simulate another client
    const res = await fetch(`${srv.baseURL}/kv?tenant=t1/foo`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 1 }) });
    expect(res.ok).toBe(true);

    await waitFor(() => expect(JSON.parse(pre.textContent || '{}')).toEqual({ foo: 1 }));
  });

  it('setAll merges without clobbering other keys', async () => {
    mountKV(srv.baseURL, 't2');
    const pre = await screen.findByTestId('kv-t2');

    // Prime with key from another "client"
    await fetch(`${srv.baseURL}/kv?tenant=t2/alpha`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 1 }) });
    await waitFor(() => expect(JSON.parse(pre.textContent || '{}')).toEqual({ alpha: 1 }));

    // Now client merges new keys without deleting alpha
    await fetch(`${srv.baseURL}/kv?tenant=t2/_bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upsert: { beta: 2 } }) });

    await waitFor(() => expect(JSON.parse(pre.textContent || '{}')).toEqual({ alpha: 1, beta: 2 }));
  });

  it('deleteKey removes only targeted key', async () => {
    mountKV(srv.baseURL, 't3');
    const pre = await screen.findByTestId('kv-t3');

    await fetch(`${srv.baseURL}/kv?tenant=t3/a`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 1 }) });
    await fetch(`${srv.baseURL}/kv?tenant=t3/b`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 2 }) });
    await waitFor(() => expect(JSON.parse(pre.textContent || '{}')).toEqual({ a: 1, b: 2 }));

    await fetch(`${srv.baseURL}/kv?tenant=t3/a`, { method: 'DELETE' });
    await waitFor(() => expect(JSON.parse(pre.textContent || '{}')).toEqual({ b: 2 }));
  });
});
