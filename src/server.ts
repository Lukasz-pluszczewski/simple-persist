// =============================
// src/server.ts (vanilla backend core)
// Framework-agnostic primitives for building servers around Simple Persist
// - Storage adapter (default: node-persist)
// - Tenancy + path helpers
// - Services: KeyValueService, CollectionService
// - Event hub for update notifications (for SSE/WebSocket adapters)
// NOTE: No Express imports here.
// =============================

import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import storageFactory from 'node-persist';

// ---- Types
export type Tenant = string;
export type KeyValueValidation = (key: string, value: any) => boolean;
export type CollectionValidation = (value: any) => boolean; // per-item check

export interface CoreOptions {
  baseDir?: string; // default '.data'
}

export interface KVOptions extends CoreOptions {
  validation?: KeyValueValidation;
}
export interface CollectionOptions extends CoreOptions {
  validation?: CollectionValidation;
}

// ---- ID helpers (shared)
export function genId(): string {
  try {
    return randomUUID();
  } catch {
    return randomBytes(16).toString('hex');
  }
}

export function normalizeCollection(data: any[]): any[] {
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return typeof (item as any).id === 'string'
        ? item
        : { ...item, id: genId() };
    }
    return { id: genId(), value: item };
  });
}

// ---- Storage adapter (node-persist by default)
export interface KeyValueStoreAdapter {
  init(dir: string): Promise<void>;
  keys(): Promise<string[]>;
  getItem<T = any>(key: string): Promise<T | undefined>;
  setItem<T = any>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class NodePersistAdapter implements KeyValueStoreAdapter {
  private _storage: any;
  async init(dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this._storage = storageFactory.create({ dir, forgiveParseErrors: true });
    await this._storage.init();
  }
  async keys() {
    return this._storage.keys();
  }
  async getItem<T = any>(key: string) {
    return this._storage.getItem(key) as T | undefined;
  }
  async setItem<T = any>(key: string, value: T) {
    await this._storage.setItem(key, value);
  }
  async removeItem(key: string) {
    await this._storage.removeItem(key);
  }
}

// ---- Event hub (per-scope emitter)
export class UpdateHub {
  private hubs = new Map<string, EventEmitter>();
  hub(scope: string) {
    let h = this.hubs.get(scope);
    if (!h) {
      h = new EventEmitter();
      h.setMaxListeners(0);
      this.hubs.set(scope, h);
    }
    return h;
  }
  emit(scope: string, payload: any) {
    this.hub(scope).emit('update', payload);
  }
  on(scope: string, listener: (payload: any) => void) {
    const h = this.hub(scope);
    h.on('update', listener);
    return () => h.off('update', listener);
  }
}

// ---- Path helpers
function storagePath(
  baseDir: string,
  type: 'kv' | 'collection',
  name: string,
  tenant: Tenant
) {
  return path.resolve(baseDir, type, name, tenant);
}

// ---- Services
export class KeyValueService {
  readonly baseDir: string;
  readonly name: string;
  readonly validation?: KeyValueValidation;
  readonly hub: UpdateHub;
  constructor(name: string, opts: KVOptions = {}, hub = new UpdateHub()) {
    this.name = name;
    this.baseDir = opts.baseDir ?? '.data';
    this.validation = opts.validation;
    this.hub = hub;
  }
  scope(tenant: Tenant) {
    return `kv:${this.name}:${tenant}`;
  }

  private async adapterFor(tenant: Tenant) {
    const a = new NodePersistAdapter();
    await a.init(storagePath(this.baseDir, 'kv', this.name, tenant));
    return a;
  }

  async getAll(tenant: Tenant) {
    const a = await this.adapterFor(tenant);
    const keys = await a.keys();
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = await a.getItem(k);
    return out;
  }
  async get(tenant: Tenant, key: string) {
    const a = await this.adapterFor(tenant);
    return a.getItem(key);
  }
  async put(tenant: Tenant, key: string, value: any) {
    if (this.validation && !this.validation(key, value))
      throw Object.assign(new Error('validation failed'), { status: 422 });
    const a = await this.adapterFor(tenant);
    await a.setItem(key, value);
    this.hub.emit(this.scope(tenant), {
      type: 'kv',
      name: this.name,
      tenant,
      key,
      version: Date.now(),
    });
  }
  async del(tenant: Tenant, key: string) {
    const a = await this.adapterFor(tenant);
    await a.removeItem(key);
    this.hub.emit(this.scope(tenant), {
      type: 'kv',
      name: this.name,
      tenant,
      key,
      deleted: true,
      version: Date.now(),
    });
  }
  async bulk(tenant: Tenant, upsert?: Record<string, any>, delKeys?: string[]) {
    const a = await this.adapterFor(tenant);
    if (upsert) {
      for (const [k, v] of Object.entries(upsert)) {
        if (this.validation && !this.validation(k, v))
          throw Object.assign(new Error('validation failed'), { status: 422 });
        await a.setItem(k, v);
      }
    }
    if (Array.isArray(delKeys)) {
      for (const k of delKeys) await a.removeItem(k);
    }
    this.hub.emit(this.scope(tenant), {
      type: 'kv',
      name: this.name,
      tenant,
      bulk: true,
      version: Date.now(),
    });
  }
}

export class CollectionService {
  readonly baseDir: string;
  readonly name: string;
  readonly validation?: CollectionValidation;
  readonly hub: UpdateHub;
  constructor(
    name: string,
    opts: CollectionOptions = {},
    hub = new UpdateHub()
  ) {
    this.name = name;
    this.baseDir = opts.baseDir ?? '.data';
    this.validation = opts.validation;
    this.hub = hub;
  }
  scope(tenant: Tenant) {
    return `collection:${this.name}:${tenant}`;
  }

  private async adapterFor(tenant: Tenant) {
    const a = new NodePersistAdapter();
    await a.init(storagePath(this.baseDir, 'collection', this.name, tenant));
    return a;
  }
  private async readAll(a: KeyValueStoreAdapter) {
    const arr = (await a.getItem('__collection')) ?? [];
    const need = Array.isArray(arr)
      ? arr.some(
          (it: any) =>
            !(
              it
              && typeof it === 'object'
              && !Array.isArray(it)
              && typeof it.id === 'string'
            )
        )
      : true;
    const normalized = need ? normalizeCollection(arr) : arr;
    if (need) await a.setItem('__collection', normalized);
    return normalized as any[];
  }
  private async writeAll(a: KeyValueStoreAdapter, next: any[]) {
    await a.setItem('__collection', next);
  }

  async getAll(tenant: Tenant) {
    const a = await this.adapterFor(tenant);
    return this.readAll(a);
  }
  async putAll(tenant: Tenant, data: any[]) {
    const a = await this.adapterFor(tenant);
    const normalized = normalizeCollection(data);
    if (this.validation)
      for (const it of normalized)
        if (!this.validation(it))
          throw Object.assign(new Error('validation failed'), { status: 422 });
    await this.writeAll(a, normalized);
    this.hub.emit(this.scope(tenant), {
      type: 'collection',
      name: this.name,
      tenant,
      version: Date.now(),
    });
  }
  async add(tenant: Tenant, item: any) {
    const a = await this.adapterFor(tenant);
    const arr = await this.readAll(a);
    const withId =
      typeof item?.id === 'string' ? item : { ...item, id: genId() };
    if (this.validation && !this.validation(withId))
      throw Object.assign(new Error('validation failed'), { status: 422 });
    const idx = arr.findIndex((x: any) => x.id === withId.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...withId, id: withId.id };
    else arr.push(withId);
    await this.writeAll(a, arr);
    this.hub.emit(this.scope(tenant), {
      type: 'collection',
      name: this.name,
      tenant,
      op: 'add',
      id: withId.id,
      version: Date.now(),
    });
    return withId;
  }
  async put(tenant: Tenant, id: string, item: any) {
    const a = await this.adapterFor(tenant);
    const arr = await this.readAll(a);
    const withId = { ...item, id };
    if (this.validation && !this.validation(withId))
      throw Object.assign(new Error('validation failed'), { status: 422 });
    const idx = arr.findIndex((x: any) => x.id === id);
    if (idx >= 0) arr[idx] = withId;
    else arr.push(withId);
    await this.writeAll(a, arr);
    this.hub.emit(this.scope(tenant), {
      type: 'collection',
      name: this.name,
      tenant,
      op: 'put',
      id,
      version: Date.now(),
    });
    return withId;
  }
  async patch(tenant: Tenant, id: string, patch: any) {
    const a = await this.adapterFor(tenant);
    const arr = await this.readAll(a);
    const idx = arr.findIndex((x: any) => x.id === id);
    const next = idx >= 0 ? { ...arr[idx], ...patch, id } : { ...patch, id };
    if (this.validation && !this.validation(next))
      throw Object.assign(new Error('validation failed'), { status: 422 });
    if (idx >= 0) arr[idx] = next;
    else arr.push(next);
    await this.writeAll(a, arr);
    this.hub.emit(this.scope(tenant), {
      type: 'collection',
      name: this.name,
      tenant,
      op: 'patch',
      id,
      version: Date.now(),
    });
    return next;
  }
  async del(tenant: Tenant, id: string) {
    const a = await this.adapterFor(tenant);
    const arr = await this.readAll(a);
    const next = arr.filter((x: any) => x.id !== id);
    await this.writeAll(a, next);
    this.hub.emit(this.scope(tenant), {
      type: 'collection',
      name: this.name,
      tenant,
      op: 'delete',
      id,
      version: Date.now(),
    });
  }
}
