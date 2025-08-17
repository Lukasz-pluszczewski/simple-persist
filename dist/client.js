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

// src/client.ts
var client_exports = {};
__export(client_exports, {
  CollectionClient: () => CollectionClient,
  KeyValueClient: () => KeyValueClient,
  SyncSession: () => SyncSession,
  ensureIdsClient: () => ensureIdsClient,
  randomId: () => randomId
});
module.exports = __toCommonJS(client_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CollectionClient,
  KeyValueClient,
  SyncSession,
  ensureIdsClient,
  randomId
});
