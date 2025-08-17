import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request2 from 'supertest';
import { createTestServer } from './testServer';
import { mountCollection, screen, waitFor, cleanup } from './reactHarness';

function parseList(el: HTMLElement): any[] { return JSON.parse(el.textContent || '[]'); }

describe('Collection E2E', () => {
  let srv: Awaited<ReturnType<typeof createTestServer>>;

  beforeAll(async () => {
    srv = await createTestServer();
  });

  afterAll(async () => {
    await srv.close();
    cleanup();
  });

  it.only('loads empty array and adds items with auto ids', async () => {
    mountCollection(srv.baseURL, 'c1');
    const pre = await screen.findByTestId('coll-c1');
    await waitFor(() => expect(parseList(pre)).toEqual([]));

    // Add from another client via HTTP
    const add = await fetch(`${srv.baseURL}/todos?tenant=c1/item`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { text: 'A' } }) });
    console.log('add', add.status, add.statusText);
    expect(add.ok).toBe(true);

    await waitFor(() => {
      const arr = parseList(pre);
      expect(arr.length).toBe(1);
      expect(arr[0].id).toBeTypeOf('string');
      expect(arr[0].text).toBe('A');
    });
  });

  it('updateItem merges; setItem replaces', async () => {
    // mount two clients in same tenant
    mountCollection(srv.baseURL, 'c2');
    const pre = await screen.findByTestId('coll-c2');
    await waitFor(() => expect(parseList(pre)).toEqual([]));

    const add = await fetch(`${srv.baseURL}/todos?tenant=c2/item`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { text: 'X', done: false, extra: 'keep?' } }) });
    const addJson = await add.json();
    const id = addJson.item.id as string;

    // update (merge)
    const patch = await fetch(`${srv.baseURL}/todos?tenant=c2/item/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch: { done: true } }) });
    expect(patch.ok).toBe(true);

    await waitFor(() => {
      const [it] = parseList(pre);
      expect(it).toMatchObject({ id, text: 'X', done: true, extra: 'keep?' });
    });

    // set (replace)
    const put = await fetch(`${srv.baseURL}/todos?tenant=c2/item/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { text: 'Y' } }) });
    expect(put.ok).toBe(true);

    await waitFor(() => {
      const [it] = parseList(pre);
      expect(it).toEqual({ id, text: 'Y' }); // replaced, extra removed
    });
  });

  it('concurrent edits to different items do not overwrite each other', async () => {
    mountCollection(srv.baseURL, 'c3');
    const pre = await screen.findByTestId('coll-c3');
    await waitFor(() => expect(parseList(pre)).toEqual([]));

    const a = await fetch(`${srv.baseURL}/todos?tenant=c3/item`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { text: 'A', done: false } }) });
    const b = await fetch(`${srv.baseURL}/todos?tenant=c3/item`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { text: 'B', done: false } }) });
    const idA = (await a.json()).item.id as string;
    const idB = (await b.json()).item.id as string;

    // Simulate near-simultaneous updates from two clients on different items
    await Promise.all([
      fetch(`${srv.baseURL}/todos?tenant=c3/item/${idA}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch: { done: true } }) }),
      fetch(`${srv.baseURL}/todos?tenant=c3/item/${idB}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch: { text: 'B!' } }) }),
    ]);

    await waitFor(() => {
      const list = parseList(pre);
      expect(list.find((x: any) => x.id === idA)).toMatchObject({ id: idA, text: 'A', done: true });
      expect(list.find((x: any) => x.id === idB)).toMatchObject({ id: idB, text: 'B!', done: false });
    });
  });

  it('validation failure returns 422 and does not modify state', async () => {
    mountCollection(srv.baseURL, 'c4');
    const pre = await screen.findByTestId('coll-c4');
    await waitFor(() => expect(parseList(pre)).toEqual([]));

    // invalid: no text & no id (server validation requires text if id missing)
    const bad = await fetch(`${srv.baseURL}/todos?tenant=c4/item`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { nope: 1 } }) });
    expect(bad.status).toBe(422);

    await waitFor(() => expect(parseList(pre)).toEqual([]));
  });

  it('server normalizes ids when PUT full array without ids (non-client actor)', async () => {
    // direct supertest call to bypass client ensureIds
    const put = await request2(srv.app)
      .put('/todos')
      .query({ tenant: 'c5' })
      .send({ data: [{ text: 'no id #1' }, { text: 'no id #2' }] })
      .set('Content-Type', 'application/json');
    expect(put.status).toBe(200);

    const get = await request2(srv.app).get('/todos').query({ tenant: 'c5' });
    expect(get.status).toBe(200);
    const arr = get.body.data as any[];
    expect(arr.length).toBe(2);
    expect(typeof arr[0].id).toBe('string');
    expect(arr[0]).toMatchObject({ text: 'no id #1' });
  });
});
