// =============================
// Minimal self-hosted persistence for Express using node-persist
// - KeyValue store (per-tenant)
// - Collection store (per-tenant)
// - Optional validation and tenant resolution
// - Simple last-write-wins sync with SSE notifications
// =============================

import type { Request, Response, NextFunction, Router } from 'express';
import express from 'express';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';
import storageFactory from 'node-persist';
import { EventEmitter } from 'events';
import { randomUUID, randomBytes } from 'crypto';

// ---- Types
export type TenantResolver = (req: Request, res: Response) => string | Error;
export type KeyValueValidation = (key: string, value: any) => boolean;
export type CollectionValidation = (value: any) => boolean; // per-item check

export interface PersistOptionsKV {
  validation?: KeyValueValidation;
  getTenant?: TenantResolver; // default: 'default'
  baseDir?: string; // default: '.data'
}

export interface PersistOptionsCollection {
  validation?: CollectionValidation;
  getTenant?: TenantResolver; // default: 'default'
  baseDir?: string; // default: '.data'
}

// ---- Internal helpers
const sseHubs = new Map<string, EventEmitter>();

function hubFor(scope: string) {
  let h = sseHubs.get(scope);
  if (!h) {
    h = new EventEmitter();
    h.setMaxListeners(0);
    sseHubs.set(scope, h);
  }
  return h;
}

function resolveTenant(req: Request, res: Response, getTenant?: TenantResolver) {
  if (!getTenant) return 'default';
  const t = getTenant(req, res);
  if (t instanceof Error) return t;
  if (!t) return 'default';
  return String(t);
}

async function getStorage(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const storage = storageFactory.create({ dir, forgiveParseErrors: true });
  await storage.init();
  return storage;
}

function storagePath(baseDir: string, type: 'kv' | 'collection', name: string, tenant: string) {
  return path.resolve(baseDir, type, name, tenant);
}

// Generate a UUID (Node built-in when available; fallback to random bytes)
function genId(): string {
  try { return randomUUID(); } catch { return randomBytes(16).toString('hex'); }
}

// Ensure each collection element is an object with an `id: string`.
// If the element is not an object, wrap it as { id, value }.
function normalizeCollection(data: any[]): any[] {
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return typeof (item as any).id === 'string' ? item : { ...item, id: genId() };
    }
    return { id: genId(), value: item };
  });
}

// ---- SSE endpoint
function attachSSE(router: Router, getScope: (req: Request, res: Response) => string | Error) {
  router.get('/__events', (req, res) => {
    const scope = getScope(req, res);
    if (scope instanceof Error) {
      res.status(401).end();
      return;
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    // @ts-ignore (not on all types)
    res.flushHeaders?.();

    const hub = hubFor(scope);
    const listener = (msg: any) => {
      res.write(`event: update
`);
      res.write(`data: ${JSON.stringify(msg)}

`);
    };
    hub.on('update', listener);

    req.on('close', () => {
      hub.off('update', listener);
    });
  });
}

// ---- KeyValue store middleware factory
export function persistKeyValue(name: string, opts: PersistOptionsKV = {}) {
  const baseDir = opts.baseDir ?? '.data';
  const scopePrefix = `kv:${name}`;
  const router = express.Router();

  // Resolve tenant + storage per request
  async function withStore(req: Request, res: Response, next: NextFunction) {
    const tenant = resolveTenant(req, res, opts.getTenant);
    if (tenant instanceof Error) return res.status(401).json({ error: tenant.message });
    (req as any).__persist = {
      tenant,
      scope: `${scopePrefix}:${tenant}`,
      baseDir,
    };
    next();
  }

  router.use(express.json());
  router.use(withStore);

  // SSE for realtime invalidation (tenant-aware)
  attachSSE(router, (req, res) => (req as any).__persist.scope);

  // Get all key-values as an object
  router.get('/', async (req, res) => {
    const { tenant, baseDir, scope } = (req as any).__persist;
    const storage = await getStorage(storagePath(baseDir, 'kv', name, tenant));
    const keys = await storage.keys();
    const result: Record<string, any> = {};
    for (const k of keys) result[k] = await storage.getItem(k);
    res.json({ data: result, version: Date.now(), tenant, name });
  });

  // Get single key
  router.get('/:key', async (req, res) => {
    const { tenant, baseDir } = (req as any).__persist;
    const storage = await getStorage(storagePath(baseDir, 'kv', name, tenant));
    const v = await storage.getItem(req.params.key);
    if (typeof v === 'undefined') return res.status(404).json({ error: 'not found' });
    res.json({ key: req.params.key, value: v, version: Date.now() });
  });

  // Put single key (create/update)
  router.put('/:key', async (req, res) => {
    const { tenant, baseDir, scope } = (req as any).__persist;
    const { value } = req.body ?? {};
    if (typeof value === 'undefined') return res.status(400).json({ error: 'missing value' });
    if (opts.validation && !opts.validation(req.params.key, value)) {
      return res.status(422).json({ error: 'validation failed' });
    }
    const storage = await getStorage(storagePath(baseDir, 'kv', name, tenant));
    await storage.setItem(req.params.key, value);
    const version = Date.now();
    hubFor(scope).emit('update', { type: 'kv', name, tenant, version, key: req.params.key });
    res.json({ ok: true, version });
  });

  // Delete key
  router.delete('/:key', async (req, res) => {
    const { tenant, baseDir, scope } = (req as any).__persist;
    const storage = await getStorage(storagePath(baseDir, 'kv', name, tenant));
    await storage.removeItem(req.params.key);
    const version = Date.now();
    hubFor(scope).emit('update', { type: 'kv', name, tenant, version, key: req.params.key, deleted: true });
    res.json({ ok: true, version });
  });

  // Bulk merge (per-key upserts and optional deletions) to avoid clobbering concurrent edits on other keys
  router.post('/_bulk', async (req, res) => {
    const { tenant, baseDir, scope } = (req as any).__persist;
    const { upsert, delete: delKeys } = (req.body ?? {}) as { upsert?: Record<string, any>, delete?: string[] };
    const storage = await getStorage(storagePath(baseDir, 'kv', name, tenant));

    if (upsert && typeof upsert === 'object') {
      for (const [k, v] of Object.entries(upsert)) {
        if (opts.validation && !opts.validation(k, v)) return res.status(422).json({ error: 'validation failed', key: k });
        await storage.setItem(k, v);
      }
    }
    if (Array.isArray(delKeys)) {
      for (const k of delKeys) {
        await storage.removeItem(k);
      }
    }
    const version = Date.now();
    hubFor(scope).emit('update', { type: 'kv', name, tenant, version, bulk: true });
    res.json({ ok: true, version });
  });

  return router;
}

// ---- Collection store middleware factory
export function persistCollection(name: string, opts: PersistOptionsCollection = {}) {
  const baseDir = opts.baseDir ?? '.data';
  const scopePrefix = `collection:${name}`;
  const router = express.Router();

  async function withStore(req: Request, res: Response, next: NextFunction) {
    const tenant = resolveTenant(req, res, opts.getTenant);
    if (tenant instanceof Error) return res.status(401).json({ error: tenant.message });
    (req as any).__persist = {
      tenant,
      scope: `${scopePrefix}:${tenant}`,
      baseDir,
    };
    next();
  }

  router.use(express.json({ limit: '2mb' }));
  router.use(withStore);

  // SSE for realtime invalidation (tenant-aware)
  attachSSE(router, (req, res) => (req as any).__persist.scope);

  // Helpers
  async function readCollection(baseDir: string, name: string, tenant: string) {
    const storage = await getStorage(storagePath(baseDir, 'collection', name, tenant));
    const arr = (await storage.getItem('__collection')) ?? [];
    const needNormalize = Array.isArray(arr) ? arr.some((it: any) => !(it && typeof it === 'object' && !Array.isArray(it) && typeof it.id === 'string')) : true;
    const normalized = needNormalize ? normalizeCollection(arr) : arr;
    if (needNormalize) await storage.setItem('__collection', normalized);
    return { storage, arr: normalized };
  }

  async function writeCollection(storage: any, next: any[]) {
    await storage.setItem('__collection', next);
  }

  // Get entire collection (array of objects with `id`)
  router.get('/', async (req, res) => {
    const { tenant, baseDir } = (req as any).__persist;
    const { arr } = await readCollection(baseDir, name, tenant);
    res.json({ data: arr, version: Date.now(), tenant, name });
  });

  // Replace entire collection (last-write-wins). Each item must have an `id`; missing ids are added.
  router.put('/', async (req, res) => {
    const { tenant, baseDir, scope } = (req as any).__persist;
    const { data } = req.body ?? {};
    if (!Array.isArray(data)) return res.status(400).json({ error: 'data must be an array' });

    const normalized = normalizeCollection(data);
    if (opts.validation) {
      for (const item of normalized) {
        if (!opts.validation(item)) return res.status(422).json({ error: 'validation failed' });
      }
    }
    const { storage } = await readCollection(baseDir, name, tenant);
    await writeCollection(storage, normalized);
    const version = Date.now();
    hubFor(scope).emit('update', { type: 'collection', name, tenant, version });
    res.json({ ok: true, version });
  });

  // Add a single item (id auto-generated if missing)
  router.post('/item', async (req, res) => {
    const { tenant, baseDir, scope } = (req as any).__persist;
    const { item } = req.body ?? {};
    if (!item || typeof item !== 'object' || Array.isArray(item)) return res.status(400).json({ error: 'item must be an object' });
    const withId = typeof item.id === 'string' ? item : { ...item, id: genId() };
    if (opts.validation && !opts.validation(withId)) return res.status(422).json({ error: 'validation failed' });

    const { storage, arr } = await readCollection(baseDir, name, tenant);
    const idx = arr.findIndex((x: any) => x.id === withId.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...withId, id: withId.id };
    else arr.push(withId);

    await writeCollection(storage, arr);
    const version = Date.now();
    hubFor(scope).emit('update', { type: 'collection', name, tenant, version, op: 'add', id: withId.id });
    res.json({ ok: true, version, item: withId });
  });

  // Replace an item entirely by id (no merge)
  router.put('/item/:id', async (req, res) => {
    const { tenant, baseDir, scope } = (req as any).__persist;
    const id = String(req.params.id);
    let item = (req.body ?? {}).item ?? req.body ?? {};
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return res.status(400).json({ error: 'item must be an object' });
    }
    item = { ...item, id };
    if (opts.validation && !opts.validation(item)) {
      return res.status(422).json({ error: 'validation failed' });
    }

    const { storage, arr } = await readCollection(baseDir, name, tenant);
    const idx = arr.findIndex((x: any) => x.id === id);
    if (idx >= 0) arr[idx] = item; else arr.push(item);

    await storage.setItem('__collection', arr);
    const version = Date.now();
    hubFor(scope).emit('update', { type: 'collection', name, tenant, version, op: 'put', id });
    res.json({ ok: true, version, item });
  });

  // Patch an item by id (upsert)
  router.patch('/item/:id', async (req, res) => {
    const { tenant, baseDir, scope } = (req as any).__persist;
    const id = String(req.params.id);
    const patch = (req.body ?? {}).patch ?? req.body ?? {};
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return res.status(400).json({ error: 'patch must be an object' });

    const { storage, arr } = await readCollection(baseDir, name, tenant);
    const idx = arr.findIndex((x: any) => x.id === id);
    const nextItem = idx >= 0 ? { ...arr[idx], ...patch, id } : { ...patch, id };
    if (opts.validation && !opts.validation(nextItem)) return res.status(422).json({ error: 'validation failed' });
    if (idx >= 0) arr[idx] = nextItem; else arr.push(nextItem);

    await writeCollection(storage, arr);
    const version = Date.now();
    hubFor(scope).emit('update', { type: 'collection', name, tenant, version, op: 'patch', id });
    res.json({ ok: true, version, item: nextItem });
  });

  // Delete an item by id
  router.delete('/item/:id', async (req, res) => {
    const { tenant, baseDir, scope } = (req as any).__persist;
    const id = String(req.params.id);
    const { storage, arr } = await readCollection(baseDir, name, tenant);
    const next = arr.filter((x: any) => x.id !== id);
    await writeCollection(storage, next);
    const version = Date.now();
    hubFor(scope).emit('update', { type: 'collection', name, tenant, version, op: 'delete', id });
    res.json({ ok: true, version, id });
  });

  return router;
}
