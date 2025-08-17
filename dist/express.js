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

// src/express.ts
var express_exports = {};
__export(express_exports, {
  persistCollection: () => persistCollection,
  persistKeyValue: () => persistKeyValue
});
module.exports = __toCommonJS(express_exports);
var import_express = __toESM(require("express"));
var path = __toESM(require("path"));
var import_fs = require("fs");
var import_node_persist = __toESM(require("node-persist"));
var import_events = require("events");
var import_crypto = require("crypto");
var sseHubs = /* @__PURE__ */ new Map();
function hubFor(scope) {
  let h = sseHubs.get(scope);
  if (!h) {
    h = new import_events.EventEmitter();
    h.setMaxListeners(0);
    sseHubs.set(scope, h);
  }
  return h;
}
function resolveTenant(req, res, getTenant) {
  if (!getTenant) return "default";
  const t = getTenant(req, res);
  if (t instanceof Error) return t;
  if (!t) return "default";
  return String(t);
}
async function getStorage(dir) {
  if (!(0, import_fs.existsSync)(dir)) (0, import_fs.mkdirSync)(dir, { recursive: true });
  const storage = import_node_persist.default.create({ dir, forgiveParseErrors: true });
  await storage.init();
  return storage;
}
function storagePath(baseDir, type, name, tenant) {
  return path.resolve(baseDir, type, name, tenant);
}
function genId() {
  try {
    return (0, import_crypto.randomUUID)();
  } catch {
    return (0, import_crypto.randomBytes)(16).toString("hex");
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
function attachSSE(router, getScope) {
  router.get("/__events", (req, res) => {
    var _a;
    const scope = getScope(req, res);
    if (scope instanceof Error) {
      res.status(401).end();
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    (_a = res.flushHeaders) == null ? void 0 : _a.call(res);
    const hub = hubFor(scope);
    const listener = (msg) => {
      res.write(`event: update
`);
      res.write(`data: ${JSON.stringify(msg)}

`);
    };
    hub.on("update", listener);
    req.on("close", () => {
      hub.off("update", listener);
    });
  });
}
function persistKeyValue(name, opts = {}) {
  const baseDir = opts.baseDir ?? ".data";
  const scopePrefix = `kv:${name}`;
  const router = import_express.default.Router();
  async function withStore(req, res, next) {
    const tenant = resolveTenant(req, res, opts.getTenant);
    if (tenant instanceof Error) return res.status(401).json({ error: tenant.message });
    req.__persist = {
      tenant,
      scope: `${scopePrefix}:${tenant}`,
      baseDir
    };
    next();
  }
  router.use(import_express.default.json());
  router.use(withStore);
  attachSSE(router, (req, res) => req.__persist.scope);
  router.get("/", async (req, res) => {
    const { tenant, baseDir: baseDir2, scope } = req.__persist;
    const storage = await getStorage(storagePath(baseDir2, "kv", name, tenant));
    const keys = await storage.keys();
    const result = {};
    for (const k of keys) result[k] = await storage.getItem(k);
    res.json({ data: result, version: Date.now(), tenant, name });
  });
  router.get("/:key", async (req, res) => {
    const { tenant, baseDir: baseDir2 } = req.__persist;
    const storage = await getStorage(storagePath(baseDir2, "kv", name, tenant));
    const v = await storage.getItem(req.params.key);
    if (typeof v === "undefined") return res.status(404).json({ error: "not found" });
    res.json({ key: req.params.key, value: v, version: Date.now() });
  });
  router.put("/:key", async (req, res) => {
    const { tenant, baseDir: baseDir2, scope } = req.__persist;
    const { value } = req.body ?? {};
    if (typeof value === "undefined") return res.status(400).json({ error: "missing value" });
    if (opts.validation && !opts.validation(req.params.key, value)) {
      return res.status(422).json({ error: "validation failed" });
    }
    const storage = await getStorage(storagePath(baseDir2, "kv", name, tenant));
    await storage.setItem(req.params.key, value);
    const version = Date.now();
    hubFor(scope).emit("update", { type: "kv", name, tenant, version, key: req.params.key });
    res.json({ ok: true, version });
  });
  router.delete("/:key", async (req, res) => {
    const { tenant, baseDir: baseDir2, scope } = req.__persist;
    const storage = await getStorage(storagePath(baseDir2, "kv", name, tenant));
    await storage.removeItem(req.params.key);
    const version = Date.now();
    hubFor(scope).emit("update", { type: "kv", name, tenant, version, key: req.params.key, deleted: true });
    res.json({ ok: true, version });
  });
  router.post("/_bulk", async (req, res) => {
    const { tenant, baseDir: baseDir2, scope } = req.__persist;
    const { upsert, delete: delKeys } = req.body ?? {};
    const storage = await getStorage(storagePath(baseDir2, "kv", name, tenant));
    if (upsert && typeof upsert === "object") {
      for (const [k, v] of Object.entries(upsert)) {
        if (opts.validation && !opts.validation(k, v)) return res.status(422).json({ error: "validation failed", key: k });
        await storage.setItem(k, v);
      }
    }
    if (Array.isArray(delKeys)) {
      for (const k of delKeys) {
        await storage.removeItem(k);
      }
    }
    const version = Date.now();
    hubFor(scope).emit("update", { type: "kv", name, tenant, version, bulk: true });
    res.json({ ok: true, version });
  });
  return router;
}
function persistCollection(name, opts = {}) {
  const baseDir = opts.baseDir ?? ".data";
  const scopePrefix = `collection:${name}`;
  const router = import_express.default.Router();
  async function withStore(req, res, next) {
    const tenant = resolveTenant(req, res, opts.getTenant);
    if (tenant instanceof Error) return res.status(401).json({ error: tenant.message });
    req.__persist = {
      tenant,
      scope: `${scopePrefix}:${tenant}`,
      baseDir
    };
    next();
  }
  router.use(import_express.default.json({ limit: "2mb" }));
  router.use(withStore);
  attachSSE(router, (req, res) => req.__persist.scope);
  async function readCollection(baseDir2, name2, tenant) {
    const storage = await getStorage(storagePath(baseDir2, "collection", name2, tenant));
    const arr = await storage.getItem("__collection") ?? [];
    const needNormalize = Array.isArray(arr) ? arr.some((it) => !(it && typeof it === "object" && !Array.isArray(it) && typeof it.id === "string")) : true;
    const normalized = needNormalize ? normalizeCollection(arr) : arr;
    if (needNormalize) await storage.setItem("__collection", normalized);
    return { storage, arr: normalized };
  }
  async function writeCollection(storage, next) {
    await storage.setItem("__collection", next);
  }
  router.get("/", async (req, res) => {
    const { tenant, baseDir: baseDir2 } = req.__persist;
    const { arr } = await readCollection(baseDir2, name, tenant);
    res.json({ data: arr, version: Date.now(), tenant, name });
  });
  router.put("/", async (req, res) => {
    const { tenant, baseDir: baseDir2, scope } = req.__persist;
    const { data } = req.body ?? {};
    if (!Array.isArray(data)) return res.status(400).json({ error: "data must be an array" });
    const normalized = normalizeCollection(data);
    if (opts.validation) {
      for (const item of normalized) {
        if (!opts.validation(item)) return res.status(422).json({ error: "validation failed" });
      }
    }
    const { storage } = await readCollection(baseDir2, name, tenant);
    await writeCollection(storage, normalized);
    const version = Date.now();
    hubFor(scope).emit("update", { type: "collection", name, tenant, version });
    res.json({ ok: true, version });
  });
  router.post("/item", async (req, res) => {
    const { tenant, baseDir: baseDir2, scope } = req.__persist;
    const { item } = req.body ?? {};
    if (!item || typeof item !== "object" || Array.isArray(item)) return res.status(400).json({ error: "item must be an object" });
    const withId = typeof item.id === "string" ? item : { ...item, id: genId() };
    if (opts.validation && !opts.validation(withId)) return res.status(422).json({ error: "validation failed" });
    const { storage, arr } = await readCollection(baseDir2, name, tenant);
    const idx = arr.findIndex((x) => x.id === withId.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...withId, id: withId.id };
    else arr.push(withId);
    await writeCollection(storage, arr);
    const version = Date.now();
    hubFor(scope).emit("update", { type: "collection", name, tenant, version, op: "add", id: withId.id });
    res.json({ ok: true, version, item: withId });
  });
  router.put("/item/:id", async (req, res) => {
    const { tenant, baseDir: baseDir2, scope } = req.__persist;
    const id = String(req.params.id);
    let item = (req.body ?? {}).item ?? req.body ?? {};
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return res.status(400).json({ error: "item must be an object" });
    }
    item = { ...item, id };
    if (opts.validation && !opts.validation(item)) {
      return res.status(422).json({ error: "validation failed" });
    }
    const { storage, arr } = await readCollection(baseDir2, name, tenant);
    const idx = arr.findIndex((x) => x.id === id);
    if (idx >= 0) arr[idx] = item;
    else arr.push(item);
    await storage.setItem("__collection", arr);
    const version = Date.now();
    hubFor(scope).emit("update", { type: "collection", name, tenant, version, op: "put", id });
    res.json({ ok: true, version, item });
  });
  router.patch("/item/:id", async (req, res) => {
    const { tenant, baseDir: baseDir2, scope } = req.__persist;
    const id = String(req.params.id);
    const patch = (req.body ?? {}).patch ?? req.body ?? {};
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return res.status(400).json({ error: "patch must be an object" });
    const { storage, arr } = await readCollection(baseDir2, name, tenant);
    const idx = arr.findIndex((x) => x.id === id);
    const nextItem = idx >= 0 ? { ...arr[idx], ...patch, id } : { ...patch, id };
    if (opts.validation && !opts.validation(nextItem)) return res.status(422).json({ error: "validation failed" });
    if (idx >= 0) arr[idx] = nextItem;
    else arr.push(nextItem);
    await writeCollection(storage, arr);
    const version = Date.now();
    hubFor(scope).emit("update", { type: "collection", name, tenant, version, op: "patch", id });
    res.json({ ok: true, version, item: nextItem });
  });
  router.delete("/item/:id", async (req, res) => {
    const { tenant, baseDir: baseDir2, scope } = req.__persist;
    const id = String(req.params.id);
    const { storage, arr } = await readCollection(baseDir2, name, tenant);
    const next = arr.filter((x) => x.id !== id);
    await writeCollection(storage, next);
    const version = Date.now();
    hubFor(scope).emit("update", { type: "collection", name, tenant, version, op: "delete", id });
    res.json({ ok: true, version, id });
  });
  return router;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  persistCollection,
  persistKeyValue
});
