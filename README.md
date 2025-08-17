# Simple Persist

> Tiny self-hosted state store for Express + React. Realtime sync, last‑write‑wins, no need for CRUD boilerplate.

![Express Logo](logo.png)

Simple Persist gives you two primitives—**KeyValue** and **Collection**—that you can drop into any Express app and bind to React with one Provider + one hook. No client state library needed, no endpoints to hand‑roll, and it works with your auth/session as-is.

* **Express**: add a router for a store (`persistKeyValue`, `persistCollection`).
* **React**: point the client at that URL (`createPersistKeyValue`, `createPersistCollection`).
* **Sync**: realtime via SSE (with polling fallback).
* **Concurrency**: per-key/per-item updates won’t clobber each other.

---

## Getting started

### Requirements

* Node 18+
* Express 4 or 5
* React 18+

### Install

```bash
npm i fullstack-simple-persist node-persist
```

### Quick start (Express)

```ts
import express from 'express';
import { persistKeyValue, persistCollection } from 'fullstack-simple-persist/express';

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
import { createPersistKeyValue, createPersistCollection } from 'fullstack-simple-persist/react';

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
* [Express API](#express-api)

    * [persistKeyValue](#persistkeyvalue)
    * [persistCollection](#persistcollection)
    * [Endpoints](#endpoints)
* [React API](#react-api)

    * [createPersistKeyValue](#createpersistkeyvalue)
    * [createPersistCollection](#createpersistcollection)
* [Sync & concurrency](#sync--concurrency)
* [Validation](#validation)
* [Multi‑tenancy](#multi-tenancy)
* [TypeScript](#typescript)
* [Examples](#examples)
* [FAQ](#faq)

---

## Concepts

* **KeyValue** — a simple map of `key -> value`.
* **Collection** — an array of objects; **every item has an `id: string`** (UUID by default). Non-object items are wrapped as `{ id, value }`.
* **Tenant** — a logical namespace (per user, per org, etc.). If you don’t provide `getTenant`, everything goes into the `default` tenant.
* **Realtime** — clients subscribe to `/__events` (Server‑Sent Events). Any write triggers an event.

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

* `GET /` → `{ data: Record<string, any>, version }`
* `GET /:key` → `{ key, value, version }` or 404
* `PUT /:key` body: `{ value }` → upsert
* `DELETE /:key` → delete
* `POST /_bulk` body: `{ upsert?: Record<string, any>, delete?: string[] }` → per‑key merge without clobbering unrelated keys
* `GET /__events` → SSE stream (internal; used by the client)

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

* `GET /` → `{ data: any[], version }` (auto‑migrates legacy items to include `id`)
* `PUT /` body: `{ data: any[] }` → replace full array (last‑write‑wins)
* `POST /item` body: `{ item }` → add/upsert single item (auto‑id if missing)
* `PUT /item/:id` body: `{ item }` → **replace** item by id (no merge)
* `PATCH /item/:id` body: `{ patch }` → **shallow merge** into item by id (upsert if missing)
* `DELETE /item/:id` → delete item by id
* `GET /__events` → SSE stream

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

* `useKeyValue(key)` → `[value, setValue]`
* `useKeyValue()` → `[map, { setAll, setMany, setKey, deleteKey }]`

**Notes**

* `setAll(map)` merges keys on the server using `/_bulk` upserts (no mass delete by default).
* `setMany(map)` is an alias of `setAll`.
* `setKey(key, value)` and `deleteKey(key)` target one key.

### `createPersistCollection(endpoint)`

Creates a Provider + hook pair bound to your Collection endpoint.

```ts
const { PersistCollection, useCollection } = createPersistCollection('/api/todos');
```

**Provider**

```tsx
<PersistCollection>{children}</PersistCollection>
```

**Hook**

```ts
const [items, { setItems, setItem, updateItem, deleteItem, addItem }] = useCollection();
```

* `setItems(next[])` → replace the whole array (LWW)
* `setItem(id, item)` → **replace** object by id (no merge)
* `updateItem(id, patch)` → **shallow merge** into object by id
* `deleteItem(id)` → remove by id
* `addItem(item)` → add (auto‑id if missing)

---

## Sync & concurrency

* **Realtime**: clients subscribe to an SSE stream at `endpoint/__events`; any write triggers a refresh. There’s also a polling fallback.
* **KeyValue**: use `/_bulk` for multi‑key updates so other clients’ keys aren’t clobbered.
* **Collection**: per‑item routes ensure that two clients changing **different** items at the same time won’t overwrite each other. Full‑array `PUT` is still available when you intend to replace everything.
* **Conflict policy**: last‑write‑wins, recommended to use granular methods (updateItem, addItem) instead of bulk (setItems)

---

## Validation

Validation is optional and runs on the server **after** IDs are ensured:

```ts
persistKeyValue('settings', {
  validation: (key, value) => typeof key === 'string' && value != null,
});

persistCollection('todos', {
  validation: (item) => typeof item?.id === 'string' && typeof item?.text === 'string',
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

## FAQ

**What about auth?**  Use your existing Express auth (cookies/sessions/JWT). If `getTenant` returns an `Error`, writes are rejected with `401`.

**Does it work offline?**  Not yet. You’ll still get polling + SSE when online.

**Can I bring my own storage?**  Today it’s `node-persist`. The API is storage‑agnostic; plugging another adapter is on the roadmap.

**What about filtering/pagination for collections?**  Intentionally omitted for simplicity—`GET /` returns the whole array.

**CORS?**  Configure it on your Express app as usual.

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
