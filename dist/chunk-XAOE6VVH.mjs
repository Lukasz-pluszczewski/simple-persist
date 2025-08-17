import {
  CollectionService,
  KeyValueService
} from "./chunk-ROW3JIAV.mjs";
import {
  __export
} from "./chunk-7P6ASYW6.mjs";

// src/express.ts
var express_exports = {};
__export(express_exports, {
  persistCollection: () => persistCollection,
  persistKeyValue: () => persistKeyValue
});
import express from "express";
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
  const router = express.Router();
  const service = new KeyValueService(name, {
    validation: opts.validation,
    baseDir: opts.baseDir
  });
  router.use(express.json());
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
  const router = express.Router();
  const service = new CollectionService(name, {
    validation: opts.validation,
    baseDir: opts.baseDir
  });
  router.use(express.json({ limit: "2mb" }));
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

export {
  persistKeyValue,
  persistCollection,
  express_exports
};
