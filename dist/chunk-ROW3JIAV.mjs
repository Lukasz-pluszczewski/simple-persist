import {
  __export
} from "./chunk-7P6ASYW6.mjs";

// src/server.ts
var server_exports = {};
__export(server_exports, {
  CollectionService: () => CollectionService,
  KeyValueService: () => KeyValueService,
  NodePersistAdapter: () => NodePersistAdapter,
  UpdateHub: () => UpdateHub,
  genId: () => genId,
  normalizeCollection: () => normalizeCollection
});
import { randomBytes, randomUUID } from "crypto";
import { EventEmitter } from "events";
import { existsSync, mkdirSync } from "fs";
import * as path from "path";
import storageFactory from "node-persist";
function genId() {
  try {
    return randomUUID();
  } catch {
    return randomBytes(16).toString("hex");
  }
}
function normalizeCollection(data) {
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return typeof item.id === "string" ? item : { ...item, id: genId() };
    }
    return { id: genId(), value: item };
  });
}
var NodePersistAdapter = class {
  _storage;
  async init(dir) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this._storage = storageFactory.create({ dir, forgiveParseErrors: true });
    await this._storage.init();
  }
  async keys() {
    return this._storage.keys();
  }
  async getItem(key) {
    return this._storage.getItem(key);
  }
  async setItem(key, value) {
    await this._storage.setItem(key, value);
  }
  async removeItem(key) {
    await this._storage.removeItem(key);
  }
};
var UpdateHub = class {
  hubs = /* @__PURE__ */ new Map();
  hub(scope) {
    let h = this.hubs.get(scope);
    if (!h) {
      h = new EventEmitter();
      h.setMaxListeners(0);
      this.hubs.set(scope, h);
    }
    return h;
  }
  emit(scope, payload) {
    this.hub(scope).emit("update", payload);
  }
  on(scope, listener) {
    const h = this.hub(scope);
    h.on("update", listener);
    return () => h.off("update", listener);
  }
};
function storagePath(baseDir, type, name, tenant) {
  return path.resolve(baseDir, type, name, tenant);
}
var KeyValueService = class {
  baseDir;
  name;
  validation;
  hub;
  constructor(name, opts = {}, hub = new UpdateHub()) {
    this.name = name;
    this.baseDir = opts.baseDir ?? ".data";
    this.validation = opts.validation;
    this.hub = hub;
  }
  scope(tenant) {
    return `kv:${this.name}:${tenant}`;
  }
  async adapterFor(tenant) {
    const a = new NodePersistAdapter();
    await a.init(storagePath(this.baseDir, "kv", this.name, tenant));
    return a;
  }
  async getAll(tenant) {
    const a = await this.adapterFor(tenant);
    const keys = await a.keys();
    const out = {};
    for (const k of keys) out[k] = await a.getItem(k);
    return out;
  }
  async get(tenant, key) {
    const a = await this.adapterFor(tenant);
    return a.getItem(key);
  }
  async put(tenant, key, value) {
    if (this.validation && !this.validation(key, value))
      throw Object.assign(new Error("validation failed"), { status: 422 });
    const a = await this.adapterFor(tenant);
    await a.setItem(key, value);
    this.hub.emit(this.scope(tenant), {
      type: "kv",
      name: this.name,
      tenant,
      key,
      version: Date.now()
    });
  }
  async del(tenant, key) {
    const a = await this.adapterFor(tenant);
    await a.removeItem(key);
    this.hub.emit(this.scope(tenant), {
      type: "kv",
      name: this.name,
      tenant,
      key,
      deleted: true,
      version: Date.now()
    });
  }
  async bulk(tenant, upsert, delKeys) {
    const a = await this.adapterFor(tenant);
    if (upsert) {
      for (const [k, v] of Object.entries(upsert)) {
        if (this.validation && !this.validation(k, v))
          throw Object.assign(new Error("validation failed"), { status: 422 });
        await a.setItem(k, v);
      }
    }
    if (Array.isArray(delKeys)) {
      for (const k of delKeys) await a.removeItem(k);
    }
    this.hub.emit(this.scope(tenant), {
      type: "kv",
      name: this.name,
      tenant,
      bulk: true,
      version: Date.now()
    });
  }
};
var CollectionService = class {
  baseDir;
  name;
  validation;
  hub;
  constructor(name, opts = {}, hub = new UpdateHub()) {
    this.name = name;
    this.baseDir = opts.baseDir ?? ".data";
    this.validation = opts.validation;
    this.hub = hub;
  }
  scope(tenant) {
    return `collection:${this.name}:${tenant}`;
  }
  async adapterFor(tenant) {
    const a = new NodePersistAdapter();
    await a.init(storagePath(this.baseDir, "collection", this.name, tenant));
    return a;
  }
  async readAll(a) {
    const arr = await a.getItem("__collection") ?? [];
    const need = Array.isArray(arr) ? arr.some(
      (it) => !(it && typeof it === "object" && !Array.isArray(it) && typeof it.id === "string")
    ) : true;
    const normalized = need ? normalizeCollection(arr) : arr;
    if (need) await a.setItem("__collection", normalized);
    return normalized;
  }
  async writeAll(a, next) {
    await a.setItem("__collection", next);
  }
  async getAll(tenant) {
    const a = await this.adapterFor(tenant);
    return this.readAll(a);
  }
  async putAll(tenant, data) {
    const a = await this.adapterFor(tenant);
    const normalized = normalizeCollection(data);
    if (this.validation) {
      for (const it of normalized)
        if (!this.validation(it))
          throw Object.assign(new Error("validation failed"), { status: 422 });
    }
    await this.writeAll(a, normalized);
    this.hub.emit(this.scope(tenant), {
      type: "collection",
      name: this.name,
      tenant,
      version: Date.now()
    });
  }
  async add(tenant, item) {
    const a = await this.adapterFor(tenant);
    const arr = await this.readAll(a);
    const withId = typeof (item == null ? void 0 : item.id) === "string" ? item : { ...item, id: genId() };
    if (this.validation && !this.validation(withId))
      throw Object.assign(new Error("validation failed"), { status: 422 });
    const idx = arr.findIndex((x) => x.id === withId.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...withId, id: withId.id };
    else arr.push(withId);
    await this.writeAll(a, arr);
    this.hub.emit(this.scope(tenant), {
      type: "collection",
      name: this.name,
      tenant,
      op: "add",
      id: withId.id,
      version: Date.now()
    });
    return withId;
  }
  async put(tenant, id, item) {
    const a = await this.adapterFor(tenant);
    const arr = await this.readAll(a);
    const withId = { ...item, id };
    if (this.validation && !this.validation(withId))
      throw Object.assign(new Error("validation failed"), { status: 422 });
    const idx = arr.findIndex((x) => x.id === id);
    if (idx >= 0) arr[idx] = withId;
    else arr.push(withId);
    await this.writeAll(a, arr);
    this.hub.emit(this.scope(tenant), {
      type: "collection",
      name: this.name,
      tenant,
      op: "put",
      id,
      version: Date.now()
    });
    return withId;
  }
  async patch(tenant, id, patch) {
    const a = await this.adapterFor(tenant);
    const arr = await this.readAll(a);
    const idx = arr.findIndex((x) => x.id === id);
    const next = idx >= 0 ? { ...arr[idx], ...patch, id } : { ...patch, id };
    if (this.validation && !this.validation(next))
      throw Object.assign(new Error("validation failed"), { status: 422 });
    if (idx >= 0) arr[idx] = next;
    else arr.push(next);
    await this.writeAll(a, arr);
    this.hub.emit(this.scope(tenant), {
      type: "collection",
      name: this.name,
      tenant,
      op: "patch",
      id,
      version: Date.now()
    });
    return next;
  }
  async del(tenant, id) {
    const a = await this.adapterFor(tenant);
    const arr = await this.readAll(a);
    const next = arr.filter((x) => x.id !== id);
    await this.writeAll(a, next);
    this.hub.emit(this.scope(tenant), {
      type: "collection",
      name: this.name,
      tenant,
      op: "delete",
      id,
      version: Date.now()
    });
  }
};

export {
  genId,
  normalizeCollection,
  NodePersistAdapter,
  UpdateHub,
  KeyValueService,
  CollectionService,
  server_exports
};
