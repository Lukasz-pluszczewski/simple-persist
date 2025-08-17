# Simple Persist

> Tiny self-hosted framework-agnostic state store with extremely simple to use Express and React adapters. Realtime sync, last‑write‑wins, no CRUD boilerplate.

![Express Logo](logo.png)

Simple Persist gives you two primitives—**KeyValue** and **Collection**—that you can drop into any Express app and bind to React with one Provider + one hook. Under the hood, it’s split into lightweight **adapters** (Express/React) on top of **vanilla cores** (server/client) so you can wire it to any framework.

- **Express adapter**: add a router (`persistKeyValue`, `persistCollection`).
- **React adapter**: point the client at that URL (`createPersistKeyValue`, `createPersistCollection`).
- **Vanilla server core**: `KeyValueService`, `CollectionService`, and `UpdateHub` for building your own adapter (Fastify, Hono, Koa, native `http`, etc.).
- **Vanilla client core**: `KeyValueClient`, `CollectionClient`, `SyncSession` if you want to use Svelte/Vue/Vite SSR or plain JS.
- **Sync**: realtime via SSE (with polling fallback).
- **Concurrency**: per-key/per-item updates won’t clobber each other.

---

## Getting started

### Requirements

* **Node 18+**
* If you use the **Express adapter**: Express 4 or 5
* If you use the **React adapter**: React 18+
* If you use **vanilla cores only**: any HTTP framework + `fetch` + `EventSource` on the client

### Install

```bash
npm i fullstack-simple-persist node-persist
```

### Quick start (Express)

```ts
import express from 'express';
import { persistCollection, persistKeyValue } from 'fullstack-simple-persist/express';

const app = express();

// KeyValue store (optional validation + multi-tenant)
app.use('/api/kv', persistKeyValue('settings', {
  validation: (key, value) => typeof key === 'string',
  getTenant: (req) => (req as any).user?.id || 'default',
}));

// Collection store (array of objects with { id: string, ... })
app.use('/api/todos', persistCollection('todos', {
  validation: (item) => typeof item?.id === 'string' && typeof item?.text === 'string',
}));

app.listen(3000);
```

### Quick start (React)

```tsx
import React from 'react';
import { createPersistCollection, createPersistKeyValue } from 'fullstack-simple-persist/react';

const { PersistKeyValue, useKeyValue } = createPersistKeyValue('/api/kv');
const { PersistCollection, useCollection } = createPersistCollection('/api/todos');

export default function App() {
  return (
    <PersistKeyValue>
      <PersistCollection>
        <UI />
      </PersistCollection>
    </PersistKeyValue>
  );
}

function UI() {
  // KeyValue
  const [username, setUsername] = useKeyValue('username');
  const [kvAll, { setAll: setKvAll, setMany, setKey, deleteKey }] = useKeyValue();

  // Collection
  const [items, { setItems, setItem, updateItem, deleteItem, addItem }] = useCollection();

  return (
    <div>
      <input value={username ?? ''} onChange={(e) => setUsername(e.target.value)} />
      <pre>{JSON.stringify(kvAll, null, 2)}</pre>

      <button onClick={() => addItem({ text: 'New', done: false })}>Add Todo</button>
      <pre>{JSON.stringify(items, null, 2)}</pre>
    </div>
  );
}
```

---

## Table of contents

* [Getting started](#getting-started)
* [Concepts](#concepts)
* [Adapters & architecture](#adapters--architecture)
* [Express API](#express-api)
  * [persistKeyValue](#persistkeyvaluename-options)
  * [persistCollection](#persistcollectionname-options)
* [React API](#react-api)
  * [createPersistKeyValue](#createpersistkeyvalueendpoint)
  * [createPersistcollection](#createpersistcollectionendpoint)
* [Vanilla server API](#vanilla-server-api)
  * [KeyValueService](#keyvalueservice)
  * [CollectionService](#collectionservice)
  * [UpdateHub](#updatehub-sse-helper)
* [Vanilla client API](#vanilla-client-api)
  * [KeyValueClient](#keyvalueclient)
  * [CollectionClient](#collectionclient)
  * [SyncSession](#syncsession)
* [Sync & concurrency](#sync--concurrency)
* [Validation](#validation)
* [Multi‑tenancy](#multi%E2%80%91tenancy)
* [Examples](#examples)
* [TypeScript](#typescript)
* [FAQ](#faq)
* [Changelog](#changelog)

---

## Concepts

* **KeyValue** — a simple map of `key -> value`.
* **Collection** — an array of objects; **every item has an `id: string`** (UUID by default). Non-object items are wrapped as `{ id, value }`.
* **Tenant** — a logical namespace (per user, per org, etc.). If you don’t provide `getTenant`, everything goes into the `default` tenant.
* **Realtime** — clients subscribe to `/__events` (Server‑Sent Events). Any write triggers an event.

---

## Adapters & architecture

Simple Persist is split into **vanilla cores** and **adapters**:

* `fullstack-simple-persist/server` — framework‑agnostic backend primitives:

  * `KeyValueService`, `CollectionService` (business logic + storage)
  * `UpdateHub` (per‑tenant event emitter)
  * `NodePersistAdapter` (default storage; swappable)
* `fullstack-simple-persist/express` — Express router that wires services + SSE.
* `fullstack-simple-persist/client` — framework‑agnostic client:

  * `KeyValueClient`, `CollectionClient` (HTTP helpers)
  * `SyncSession` (SSE + polling)
  * `randomId`, `ensureIdsClient` helpers
* `fullstack-simple-persist/react` — React Provider + hooks built on the vanilla client.

This makes it trivial to add adapters for Fastify/Hono/Koa or Vue/Svelte/etc. without touching core logic.

---

## Express API

### `persistKeyValue(name, options)`

Mounts a router that stores key–value pairs under a tenant‑scoped directory.

```ts
import { persistKeyValue } from 'fullstack-simple-persist/express';
app.use('/api/kv', persistKeyValue('settings', {
  validation?: (key: string, value: any) => boolean,
  getTenant?: (req, res) => string | Error,
  baseDir?: string, // default '.data'
}));
```

**Routes exposed**

- `GET /` → `{ data: Record<string, any>, version }`
- `GET /:key` → `{ key, value, version }` or 404
- `PUT /:key` body: `{ value }` → upsert
- `DELETE /:key` → delete
- `POST /_bulk` body: `{ upsert?: Record<string, any>, delete?: string[] }` → per‑key merge without clobbering unrelated keys
- `GET /__events` → SSE stream (internal; used by the client)

### `persistCollection(name, options)`

Mounts a router that stores an array of objects with `id`.

```ts
import { persistCollection } from 'fullstack-simple-persist/express';
app.use('/api/todos', persistCollection('todos', {
  validation?: (item: any) => boolean,
  getTenant?: (req, res) => string | Error,
  baseDir?: string, // default '.data'
}));
```

**Routes exposed**

- `GET /` → `{ data: any[], version }` (auto‑migrates legacy items to include `id`)
- `PUT /` body: `{ data: any[] }` → replace full array (last‑write‑wins)
- `POST /item` body: `{ item }` → add/upsert single item (auto‑id if missing)
- `PUT /item/:id` body: `{ item }` → **replace** item by id (no merge)
- `PATCH /item/:id` body: `{ patch }` → **shallow merge** into item by id (upsert if missing)
- `DELETE /item/:id` → delete item by id
- `GET /__events` → SSE stream

> Storage engine: \[node‑persist] under the hood; per‑store, per‑tenant directories. You don’t need to configure it unless you want to change `baseDir`.

---

## React API

### `createPersistKeyValue(endpoint)`

Creates a Provider + hook pair bound to your KeyValue endpoint.

```ts
const { PersistKeyValue, useKeyValue } = createPersistKeyValue('/api/kv');
```

**Provider**

```tsx
<PersistKeyValue>{children}</PersistKeyValue>
```

**Hook**

- `useKeyValue(key)` → `[value, setValue]`
- `useKeyValue()` → `[map, { setAll, setMany, setKey, deleteKey }]`

**Notes**

- `setAll(map)` merges keys on the server using `/_bulk` upserts (no mass delete by default).
- `setMany(map)` is an alias of `setAll`.
- `setKey(key, value)` and `deleteKey(key)` target one key.

### `createPersistCollection(endpoint)`

Creates a Provider + hook pair bound to your Collection endpoint.

```ts
const { PersistCollection, useCollection } =
  createPersistCollection('/api/todos');
```

**Provider**

```tsx
<PersistCollection>{children}</PersistCollection>
```

**Hook**

```ts
const [items, { setItems, setItem, updateItem, deleteItem, addItem }] =
  useCollection();
```

- `setItems(next[])` → replace the whole array (LWW)
- `setItem(id, item)` → **replace** object by id (no merge)
- `updateItem(id, patch)` → **shallow merge** into object by id
- `deleteItem(id)` → remove by id
- `addItem(item)` → add (auto‑id if missing)

---

## Vanilla server API

You can build your own backend adapter on top of the **vanilla services**.

### `KeyValueService`

```ts
import { KeyValueService, UpdateHub } from 'fullstack-simple-persist/server';

const hub = new UpdateHub();
const kv = new KeyValueService('settings', { baseDir: '.data' }, hub);

// Example within any HTTP handler
await kv.put(tenant, 'theme', 'dark');
const map = await kv.getAll(tenant);
await kv.bulk(tenant, { locale: 'en-GB' });
```

### `CollectionService`

```ts
import { CollectionService, UpdateHub } from 'fullstack-simple-persist/server';

const hub = new UpdateHub();
const todos = new CollectionService('todos', {}, hub);

const all = await todos.getAll(tenant);
const saved = await todos.add(tenant, { text: 'New' });
await todos.patch(tenant, saved.id, { done: true });
await todos.put(tenant, saved.id, { text: 'Replace entirely' });
await todos.del(tenant, saved.id);
```

### `UpdateHub` (SSE helper)

Use `hub.on(scope, cb)` to subscribe and `hub.emit(scope, payload)` to notify. For SSE, the **scope** is typically `${type}:${name}:${tenant}` (e.g., `kv:settings:alice`).

```ts
import { UpdateHub } from 'fullstack-simple-persist/server';

const hub = new UpdateHub();
const off = hub.on('kv:settings:alice', (payload) => {
  // write to SSE response: `event: update` + `data: ${JSON.stringify(payload)}`
});
// call off() when connection closes
```

---

## Vanilla client API

If you’re not on React, use the **vanilla client**.

### `KeyValueClient`

```ts
import { KeyValueClient } from 'fullstack-simple-persist/client';

const kv = new KeyValueClient('/api/kv');
await kv.setKey('username', 'alice');
await kv.bulk({ theme: 'dark' });
```

### `CollectionClient`

```ts
import { CollectionClient } from 'fullstack-simple-persist/client';

const todos = new CollectionClient('/api/todos');
const item = await todos.add({ text: 'A' });
await todos.updateItem(item.id, { done: true });
await todos.setItem(item.id, { text: 'B' });
```

### `SyncSession`

```ts
import { SyncSession } from 'fullstack-simple-persist/client';

const session = new SyncSession('/api/kv', (data) => {
  // update your UI state with new data
});
session.fetchAll();
session.startSSE();
// session.stop() on teardown
```

---

## Sync & concurrency

- **Realtime**: clients subscribe to an SSE stream at `endpoint/__events`; any write triggers a refresh. There’s also a polling fallback.
- **KeyValue**: use `/_bulk` for multi‑key updates so other clients’ keys aren’t clobbered.
- **Collection**: per‑item routes ensure that two clients changing **different** items at the same time won’t overwrite each other. Full‑array `PUT` is still available when you intend to replace everything.
- **Conflict policy**: last‑write‑wins (use granular methods like `updateItem`, `addItem` for fewer conflicts).

---

## Validation

Validation is optional and runs on the server **after** IDs are ensured:

```ts
persistKeyValue('settings', {
  validation: (key, value) => typeof key === 'string' && value != null,
});

persistCollection('todos', {
  validation: (item) =>
    typeof item?.id === 'string' && typeof item?.text === 'string',
});
```

Responds with `422 { error: 'validation failed' }` if a value doesn’t pass.

---

## Multi‑tenancy

Provide `getTenant(req, res)` to scope data per user/org. Return a string or an `Error` (which results in `401`). If omitted, tenant is `'default'`.

```ts
persistCollection('todos', {
  getTenant: (req) => {
    const user = (req as any).user;
    return user ? user.id : new Error('Unauthenticated');
  },
});
```

---

## Examples

### Replace vs update (collections)

```ts
// Replace entire object
await setItem(id, { text: 'Buy milk', done: true });

// Shallow merge
await updateItem(id, { done: false });

// Add auto-id
await addItem({ text: 'Read docs', done: false });
```

### Non‑clobbering KV merge

```ts
// Merge without deleting other keys
await setMany({ theme: 'dark', locale: 'en-GB' });

// Single key
await setKey('username', 'alice');
await deleteKey('oldKey');
```

---

## TypeScript

You can add type annotations to your stores for autocompletion and type safety.

```ts
// KeyValue store
const { PersistKeyValue, useKeyValue } = createPersistKeyValue<{
  setting: 'foo' | 'bar';
}>('/api/keyvalue');

const [setting, setSetting] = useKeyValue('setting'); // ['foo' | 'bar', (next: 'foo' | 'bar') => Promise<void>]

setSetting('baz'); // error: Argument of type '"baz"' is not assignable to parameter of type '"foo" | "bar"'

// Collection store
type Todo = { id: string; foo: string; bar: number };
const { PersistCollection, useCollection } =
  createPersistCollection<Todo>('/api/todos');

const [todos, { setItems, setItem, updateItem, deleteItem, addItem }] =
  useCollection();

addItem({ id: '1', foo: 'bar', bar: 1 }); // ok
addItem({ id: '1', foo: 2, bar: 1 }); // error: type 'number' is not assignable to type 'string'
```

---

## FAQ

**What about auth?** Use your existing Express auth (cookies/sessions/JWT). If `getTenant` returns an `Error`, writes are rejected with `401`.

**Does it work offline?** Not yet. You’ll still get polling + SSE when online.

**Can I bring my own storage?** Yes. The server core uses an adapter interface. We ship `NodePersistAdapter` by default; you can implement your own adapter with the same methods (`init`, `keys`, `getItem`, `setItem`, `removeItem`).

**What about filtering/pagination for collections?** Intentionally omitted for simplicity—`GET /` returns the whole array.

**CORS?** Configure it on your framework as usual.

---

## Changelog

### 1.0.0

- Initial release
- KeyValue and Collection stores
- Support for Express and React
- Sync via SSE and polling fallback
- Validation and tenant resolution
- Multi‑tenancy

---

## License

MIT
