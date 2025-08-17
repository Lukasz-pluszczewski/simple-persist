var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  client: () => client_exports,
  express: () => express_exports,
  react: () => react_exports,
  server: () => server_exports
});
module.exports = __toCommonJS(src_exports);

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
var import_node_crypto = require("crypto");
var import_node_events = require("events");
var import_node_fs = require("fs");
var path = __toESM(require("path"));
var import_node_persist = __toESM(require("node-persist"));
function genId() {
  try {
    return (0, import_node_crypto.randomUUID)();
  } catch {
    return (0, import_node_crypto.randomBytes)(16).toString("hex");
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
    if (!(0, import_node_fs.existsSync)(dir)) (0, import_node_fs.mkdirSync)(dir, { recursive: true });
    this._storage = import_node_persist.default.create({ dir, forgiveParseErrors: true });
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
      h = new import_node_events.EventEmitter();
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

// src/client.ts
var client_exports = {};
__export(client_exports, {
  CollectionClient: () => CollectionClient,
  KeyValueClient: () => KeyValueClient,
  SyncSession: () => SyncSession,
  ensureIdsClient: () => ensureIdsClient,
  randomId: () => randomId
});
function randomId() {
  try {
    const c = globalThis.crypto;
    if (c == null ? void 0 : c.randomUUID) return c.randomUUID();
    if (c == null ? void 0 : c.getRandomValues) {
      const b = new Uint8Array(16);
      c.getRandomValues(b);
      b[6] = b[6] & 15 | 64;
      b[8] = b[8] & 63 | 128;
      const hex = Array.from(b).map((x) => x.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
    }
  } catch {
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function ensureIdsClient(arr) {
  return (arr ?? []).map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return typeof item.id === "string" ? item : { ...item, id: randomId() };
    }
    return { id: randomId(), value: item };
  });
}
var SyncSession = class {
  endpoint;
  onChange;
  pollMs;
  sse;
  timer;
  current;
  constructor(endpoint, onChange, pollMs = 1e4) {
    this.endpoint = endpoint.replace(/\/?$/, "");
    this.onChange = onChange;
    this.pollMs = pollMs;
  }
  setState(next) {
    if (!this.current || next.version >= this.current.version) {
      this.current = next;
      this.onChange(next.data);
    }
  }
  async fetchAll(path2 = "/") {
    const res = await fetch(this.endpoint + path2, { credentials: "include" });
    if (!res.ok) throw new Error("fetch failed");
    const json = await res.json();
    this.setState({ data: json.data, version: json.version });
    return json;
  }
  startSSE() {
    try {
      const sseUrl = this.endpoint + "/__events";
      const sse = new EventSource(sseUrl, { withCredentials: true });
      sse.addEventListener("update", () => this.fetchAll().catch(() => void 0));
      sse.onerror = () => {
        sse.close();
        this.sse = void 0;
        this.startPolling();
      };
      this.sse = sse;
    } catch {
      this.startPolling();
    }
  }
  startPolling() {
    const tick = () => this.fetchAll().catch(() => void 0);
    this.timer = window.setInterval(tick, this.pollMs);
  }
  stop() {
    if (this.sse) this.sse.close();
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
};
var KeyValueClient = class {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.endpoint = endpoint.replace(/\/?$/, "");
  }
  async getAll() {
    return (await (await fetch(this.endpoint + "/", { credentials: "include" })).json()).data;
  }
  async setKey(key, value) {
    const r = await fetch(`${this.endpoint}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ value })
    });
    if (!r.ok) throw new Error("write failed");
  }
  async deleteKey(key) {
    const r = await fetch(`${this.endpoint}/${encodeURIComponent(key)}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!r.ok) throw new Error("delete failed");
  }
  async bulk(upsert, del) {
    const r = await fetch(`${this.endpoint}/_bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ upsert, delete: del })
    });
    if (!r.ok) throw new Error("bulk failed");
  }
};
var CollectionClient = class {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.endpoint = endpoint.replace(/\/?$/, "");
  }
  async getAll() {
    return (await (await fetch(this.endpoint + "/", { credentials: "include" })).json()).data;
  }
  async putAll(arr) {
    const r = await fetch(`${this.endpoint}/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ data: ensureIdsClient(arr) })
    });
    if (!r.ok) throw new Error("write failed");
  }
  async add(item) {
    const withId = typeof (item == null ? void 0 : item.id) === "string" ? item : { ...item, id: randomId() };
    const r = await fetch(`${this.endpoint}/item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ item: withId })
    });
    if (!r.ok) throw new Error("add failed");
    return withId;
  }
  async setItem(id, item) {
    const r = await fetch(`${this.endpoint}/item/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ item: { ...item, id } })
    });
    if (!r.ok) throw new Error("put failed");
  }
  async updateItem(id, patch) {
    const r = await fetch(`${this.endpoint}/item/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ patch })
    });
    if (!r.ok) throw new Error("patch failed");
  }
  async deleteItem(id) {
    const r = await fetch(`${this.endpoint}/item/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!r.ok) throw new Error("delete failed");
  }
};

// src/react.tsx
var react_exports = {};
__export(react_exports, {
  createPersistCollection: () => createPersistCollection,
  createPersistKeyValue: () => createPersistKeyValue
});
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function createPersistKeyValue(endpoint) {
  const Ctx = (0, import_react.createContext)(null);
  function Provider({ children }) {
    const [state, setState] = (0, import_react.useState)({});
    const clientRef = (0, import_react.useRef)(new KeyValueClient(endpoint));
    const sessionRef = (0, import_react.useRef)();
    (0, import_react.useEffect)(() => {
      const session = new SyncSession(
        endpoint,
        (data) => setState(data ?? {})
      );
      sessionRef.current = session;
      session.fetchAll().catch(() => void 0);
      session.startSSE();
      return () => session.stop();
    }, []);
    const api = (0, import_react.useMemo)(
      () => ({
        state,
        set: async (key, value) => {
          await clientRef.current.setKey(key, value);
          setState((prev) => ({ ...prev, [key]: value }));
        },
        refresh: async () => {
          var _a;
          await ((_a = sessionRef.current) == null ? void 0 : _a.fetchAll());
        }
      }),
      [state]
    );
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ctx.Provider, { value: api, children });
  }
  function useKeyValue(key) {
    const ctx = (0, import_react.useContext)(Ctx);
    if (!ctx) throw new Error("PersistKeyValue provider missing");
    const client = (0, import_react.useRef)(new KeyValueClient(endpoint)).current;
    const setAll = async (next) => {
      await client.bulk(next);
      await ctx.refresh();
    };
    const setMany = setAll;
    const setKey = async (k, value) => {
      await client.setKey(k, value);
      await ctx.refresh();
    };
    const deleteKey = async (k) => {
      await client.deleteKey(k);
      await ctx.refresh();
    };
    if (typeof key === "string") {
      const value = ctx.state[key];
      const setter = async (next) => setKey(key, next);
      return [value, setter];
    }
    return [ctx.state, { setAll, setMany, setKey, deleteKey }];
  }
  return { PersistKeyValue: Provider, useKeyValue };
}
function createPersistCollection(endpoint) {
  const Ctx = (0, import_react.createContext)(null);
  function Provider({ children }) {
    const [state, setState] = (0, import_react.useState)([]);
    const clientRef = (0, import_react.useRef)(new CollectionClient(endpoint));
    const sessionRef = (0, import_react.useRef)();
    (0, import_react.useEffect)(() => {
      const session = new SyncSession(
        endpoint,
        (data) => setState(Array.isArray(data) ? data : [])
      );
      sessionRef.current = session;
      session.fetchAll().catch(() => void 0);
      session.startSSE();
      return () => session.stop();
    }, []);
    const api = (0, import_react.useMemo)(
      () => ({
        state,
        setAll: async (arr) => {
          await clientRef.current.putAll(ensureIdsClient(arr));
          setState(arr);
        },
        refresh: async () => {
          var _a;
          await ((_a = sessionRef.current) == null ? void 0 : _a.fetchAll());
        }
      }),
      [state]
    );
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ctx.Provider, { value: api, children });
  }
  function useCollection() {
    const ctx = (0, import_react.useContext)(Ctx);
    if (!ctx) throw new Error("PersistCollection provider missing");
    const client = (0, import_react.useRef)(new CollectionClient(endpoint)).current;
    const setItems = async (next) => {
      await client.putAll(ensureIdsClient(next));
      await ctx.refresh();
    };
    const setItem = async (id, item) => {
      if (item.id && item.id !== id)
        throw new Error(
          "Unexpected id mismatch in setItem second parameter. You cannot update item's id"
        );
      await client.setItem(id, item);
      await ctx.refresh();
    };
    const updateItem = async (id, patch) => {
      await client.updateItem(id, patch);
      await ctx.refresh();
    };
    const deleteItem = async (id) => {
      await client.deleteItem(id);
      await ctx.refresh();
    };
    const addItem = async (item) => {
      const withId = typeof (item == null ? void 0 : item.id) === "string" ? item : { ...item, id: randomId() };
      await client.add(withId);
      await ctx.refresh();
    };
    return [ctx.state, { setItems, setItem, updateItem, deleteItem, addItem }];
  }
  return { PersistCollection: Provider, useCollection };
}

// src/express.ts
var express_exports = {};
__export(express_exports, {
  persistCollection: () => persistCollection,
  persistKeyValue: () => persistKeyValue
});
var import_express = __toESM(require("express"));
function attachSSE(router, hub, getScope) {
  router.get("/__events", (req, res) => {
    var _a;
    const scope = getScope(req, res);
    if (scope instanceof Error) return res.status(401).end();
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    (_a = res.flushHeaders) == null ? void 0 : _a.call(res);
    const off = hub.on(scope, (msg) => {
      res.write("event: update\n");
      res.write(`data: ${JSON.stringify(msg)}

`);
    });
    req.on("close", () => off());
  });
}
function resolveTenant(req, res, getTenant) {
  if (!getTenant) return "default";
  const t = getTenant(req, res);
  if (t instanceof Error) return t;
  return t || "default";
}
function persistKeyValue(name, opts = {}) {
  const router = import_express.default.Router();
  const service = new KeyValueService(name, {
    validation: opts.validation,
    baseDir: opts.baseDir
  });
  router.use(import_express.default.json());
  router.use((req, res, next) => {
    const tenant = resolveTenant(req, res, opts.getTenant);
    if (tenant instanceof Error)
      return res.status(401).json({ error: tenant.message });
    req.__tenant = tenant;
    next();
  });
  attachSSE(
    router,
    service.hub,
    (req, res) => service.scope(req.__tenant)
  );
  router.get("/", async (req, res) => {
    const tenant = req.__tenant;
    const data = await service.getAll(tenant);
    res.json({ data, version: Date.now(), tenant, name });
  });
  router.get("/:key", async (req, res) => {
    const tenant = req.__tenant;
    const v = await service.get(tenant, req.params.key);
    if (typeof v === "undefined")
      return res.status(404).json({ error: "not found" });
    res.json({ key: req.params.key, value: v, version: Date.now() });
  });
  router.put("/:key", async (req, res) => {
    const tenant = req.__tenant;
    const { value } = req.body ?? {};
    if (typeof value === "undefined")
      return res.status(400).json({ error: "missing value" });
    try {
      await service.put(tenant, req.params.key, value);
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }
    res.json({ ok: true, version: Date.now() });
  });
  router.delete("/:key", async (req, res) => {
    const tenant = req.__tenant;
    await service.del(tenant, req.params.key);
    res.json({ ok: true, version: Date.now() });
  });
  router.post("/_bulk", async (req, res) => {
    const tenant = req.__tenant;
    const { upsert, delete: delKeys } = req.body ?? {};
    try {
      await service.bulk(tenant, upsert, delKeys);
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }
    res.json({ ok: true, version: Date.now() });
  });
  return router;
}
function persistCollection(name, opts = {}) {
  const router = import_express.default.Router();
  const service = new CollectionService(name, {
    validation: opts.validation,
    baseDir: opts.baseDir
  });
  router.use(import_express.default.json({ limit: "2mb" }));
  router.use((req, res, next) => {
    const tenant = resolveTenant(req, res, opts.getTenant);
    if (tenant instanceof Error)
      return res.status(401).json({ error: tenant.message });
    req.__tenant = tenant;
    next();
  });
  attachSSE(
    router,
    service.hub,
    (req, res) => service.scope(req.__tenant)
  );
  router.get("/", async (req, res) => {
    const tenant = req.__tenant;
    const data = await service.getAll(tenant);
    res.json({ data, version: Date.now(), tenant, name });
  });
  router.put("/", async (req, res) => {
    const tenant = req.__tenant;
    const { data } = req.body ?? {};
    if (!Array.isArray(data))
      return res.status(400).json({ error: "data must be an array" });
    try {
      await service.putAll(tenant, data);
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }
    res.json({ ok: true, version: Date.now() });
  });
  router.post("/item", async (req, res) => {
    const tenant = req.__tenant;
    const { item } = req.body ?? {};
    if (!item || typeof item !== "object" || Array.isArray(item))
      return res.status(400).json({ error: "item must be an object" });
    try {
      const saved = await service.add(tenant, item);
      return res.json({ ok: true, version: Date.now(), item: saved });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }
  });
  router.put("/item/:id", async (req, res) => {
    const tenant = req.__tenant;
    const id = String(req.params.id);
    let item = (req.body ?? {}).item ?? req.body ?? {};
    if (!item || typeof item !== "object" || Array.isArray(item))
      return res.status(400).json({ error: "item must be an object" });
    try {
      const saved = await service.put(tenant, id, item);
      return res.json({ ok: true, version: Date.now(), item: saved });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }
  });
  router.patch("/item/:id", async (req, res) => {
    const tenant = req.__tenant;
    const id = String(req.params.id);
    const patch = (req.body ?? {}).patch ?? req.body ?? {};
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      return res.status(400).json({ error: "patch must be an object" });
    try {
      const saved = await service.patch(tenant, id, patch);
      return res.json({ ok: true, version: Date.now(), item: saved });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message });
    }
  });
  router.delete("/item/:id", async (req, res) => {
    const tenant = req.__tenant;
    const id = String(req.params.id);
    await service.del(tenant, id);
    res.json({ ok: true, version: Date.now(), id });
  });
  return router;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  client,
  express,
  react,
  server
});
