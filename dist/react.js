var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react.tsx
var react_exports = {};
__export(react_exports, {
  createPersistCollection: () => createPersistCollection,
  createPersistKeyValue: () => createPersistKeyValue
});
module.exports = __toCommonJS(react_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
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
var SyncCore = class {
  endpoint;
  onChange;
  current;
  pollMs;
  sse;
  timer;
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
  async fetchAll(path = "/") {
    const res = await fetch(this.endpoint + path, { credentials: "include" });
    if (!res.ok) throw new Error("fetch failed");
    const json = await res.json();
    this.setState({ data: json.data, version: json.version });
    return json;
  }
  startSSE() {
    try {
      const sseUrl = this.endpoint + "/__events";
      const sse = new EventSource(sseUrl, { withCredentials: true });
      sse.addEventListener("update", () => {
        this.fetchAll().catch(() => void 0);
      });
      sse.onerror = () => {
        sse.close();
        this.sse = void 0;
        this.startPolling();
      };
      this.sse = sse;
    } catch (e) {
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
function createPersistKeyValue(endpoint) {
  const Ctx = (0, import_react.createContext)(null);
  function Provider({ children }) {
    const [state, setState] = (0, import_react.useState)({});
    const coreRef = (0, import_react.useRef)(void 0);
    (0, import_react.useEffect)(() => {
      const core = new SyncCore(endpoint, (data) => setState(data ?? {}));
      coreRef.current = core;
      core.fetchAll().catch(() => void 0);
      core.startSSE();
      return () => core.stop();
    }, []);
    const api = (0, import_react.useMemo)(() => ({
      state,
      set: async (key, value) => {
        const res = await fetch(`${endpoint}/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ value })
        });
        if (!res.ok) throw new Error("write failed");
        setState((prev) => ({ ...prev, [key]: value }));
      },
      refresh: async () => {
        var _a;
        await ((_a = coreRef.current) == null ? void 0 : _a.fetchAll());
      }
    }), [state]);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ctx.Provider, { value: api, children });
  }
  function useKeyValue(key) {
    const ctx = (0, import_react.useContext)(Ctx);
    if (!ctx) throw new Error("PersistKeyValue provider missing");
    const setAll = async (next) => {
      const res = await fetch(`${endpoint}/_bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ upsert: next })
      });
      if (!res.ok) throw new Error("bulk failed");
      await ctx.refresh();
    };
    const setMany = setAll;
    const setKey = async (k, value) => {
      const res = await fetch(`${endpoint}/${encodeURIComponent(k)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value })
      });
      if (!res.ok) throw new Error("write failed");
      await ctx.refresh();
    };
    const deleteKey = async (k) => {
      const res = await fetch(`${endpoint}/${encodeURIComponent(k)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("delete failed");
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
    const coreRef = (0, import_react.useRef)(void 0);
    (0, import_react.useEffect)(() => {
      const core = new SyncCore(endpoint, (data) => setState(Array.isArray(data) ? data : []));
      coreRef.current = core;
      core.fetchAll().catch(() => void 0);
      core.startSSE();
      return () => core.stop();
    }, []);
    const api = (0, import_react.useMemo)(() => ({
      state,
      setAll: async (arr) => {
        const arrWithIds = ensureIdsClient(arr);
        const res = await fetch(`${endpoint}/`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ data: arrWithIds })
        });
        if (!res.ok) throw new Error("write failed");
        setState(arrWithIds);
      },
      refresh: async () => {
        var _a;
        await ((_a = coreRef.current) == null ? void 0 : _a.fetchAll());
      }
    }), [state]);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ctx.Provider, { value: api, children });
  }
  function useCollection() {
    const ctx = (0, import_react.useContext)(Ctx);
    if (!ctx) throw new Error("PersistCollection provider missing");
    const setItems = async (next) => {
      const withIds = ensureIdsClient(next);
      await ctx.setAll(withIds);
    };
    const setItem = async (id, item) => {
      const withId = typeof (item == null ? void 0 : item.id) === "string" ? { ...item, id } : { ...item, id };
      const res = await fetch(`${endpoint}/item/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ item: withId })
      });
      if (!res.ok) throw new Error("put failed");
      await ctx.refresh();
    };
    const updateItem = async (id, patch) => {
      const res = await fetch(`${endpoint}/item/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patch })
      });
      if (!res.ok) throw new Error("patch failed");
      await ctx.refresh();
    };
    const deleteItem = async (id) => {
      const res = await fetch(`${endpoint}/item/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("delete failed");
      await ctx.refresh();
    };
    const addItem = async (item) => {
      const withId = typeof (item == null ? void 0 : item.id) === "string" ? item : { ...item, id: randomId() };
      const res = await fetch(`${endpoint}/item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ item: withId })
      });
      if (!res.ok) throw new Error("add failed");
      await ctx.refresh();
    };
    return [ctx.state, { setItems, setItem, updateItem, deleteItem, addItem }];
  }
  return { PersistCollection: Provider, useCollection };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPersistCollection,
  createPersistKeyValue
});
