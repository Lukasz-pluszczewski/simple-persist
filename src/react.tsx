// =============================
// Tiny client libraries that create Provider + hooks per endpoint
// - createPersistKeyValue(endpoint)
// - createPersistCollection(endpoint)
// Handles sync via SSE (if available) and polling fallback
// =============================

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Client-side UUID generator (uses Web Crypto when available)
function randomId(): string {
  try {
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
    if (c?.getRandomValues) {
      const b = new Uint8Array(16);
      c.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40; // version 4
      b[8] = (b[8] & 0x3f) | 0x80; // variant
      const hex = Array.from(b).map((x) => x.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
    }
  } catch {}
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function ensureIdsClient(arr: any[]): any[] {
  return (arr ?? []).map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return typeof (item as any).id === 'string' ? item : { ...item, id: randomId() };
    }
    return { id: randomId(), value: item };
  });
}

type LWW = { version: number };

// ---- Generic sync core (reusable for future stores)
class SyncCore<T> {
  private endpoint: string;
  private onChange: (data: T) => void;
  private current?: { data: T; version: number };
  private pollMs: number;
  private sse?: EventSource;
  private timer?: number;

  constructor(endpoint: string, onChange: (data: T) => void, pollMs = 10000) {
    this.endpoint = endpoint.replace(/\/?$/, '');
    this.onChange = onChange;
    this.pollMs = pollMs;
  }

  private setState(next: { data: T; version: number }) {
    if (!this.current || next.version >= this.current.version) {
      this.current = next;
      this.onChange(next.data);
    }
  }

  async fetchAll(path = '/') {
    const res = await fetch(this.endpoint + path, { credentials: 'include' });
    if (!res.ok) throw new Error('fetch failed');
    const json = await res.json();
    this.setState({ data: json.data, version: json.version });
    return json as { data: T; version: number };
  }

  startSSE() {
    try {
      const sseUrl = this.endpoint + '/__events';
      const sse = new EventSource(sseUrl, { withCredentials: true });
      sse.addEventListener('update', () => {
        // On any update, refetch
        this.fetchAll().catch(() => void 0);
      });
      sse.onerror = () => {
        sse.close();
        this.sse = undefined;
        this.startPolling();
      };
      this.sse = sse;
    } catch (e) {
      this.startPolling();
    }
  }

  startPolling() {
    const tick = () => this.fetchAll().catch(() => void 0);
    // @ts-ignore - window present in browser
    this.timer = window.setInterval(tick, this.pollMs);
  }

  stop() {
    if (this.sse) this.sse.close();
    if (this.timer) {
      // @ts-ignore
      clearInterval(this.timer);
    }
  }
}

// ---- KeyValue: context + hook factory
export function createPersistKeyValue<TStore extends Record<string, any>>(endpoint: string) {
  const Ctx = createContext<{
    state: TStore;
    set: (key: string, value: any) => Promise<void>;
    refresh: () => Promise<void>;
  } | null>(null);

  function Provider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<TStore>({});
    const coreRef = useRef<SyncCore<TStore>>(undefined);

    useEffect(() => {
      const core = new SyncCore<TStore>(endpoint, (data) => setState(data ?? {}));
      coreRef.current = core;
      core.fetchAll().catch(() => void 0);
      core.startSSE();
      return () => core.stop();
    }, []);

    const api = useMemo(() => ({
      state,
      set: async (key: string, value: any) => {
        const res = await fetch(`${endpoint}/${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ value }),
        });
        if (!res.ok) throw new Error('write failed');
        // Optimistic: update local immediately (last-write-wins)
        setState((prev) => ({ ...prev, [key]: value }));
      },
      refresh: async () => {
        await coreRef.current?.fetchAll();
      },
    }), [state]);

    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
  }

  // Hook: useKeyValue(key?)
  function useKeyValue<TKey extends keyof TStore>(key: TKey): [TStore[TKey], (next: TStore[TKey]) => Promise<void>];
  function useKeyValue(): [TStore, {
    setAll: (next: TStore) => Promise<void>;
    setMany: (upsert: TStore) => Promise<void>;
    setKey: (key: keyof TStore, value: TStore[keyof TStore]) => Promise<void>;
    deleteKey: (key: keyof TStore) => Promise<void>;
  }];
  function useKeyValue(key?: string):
    [TStore[keyof TStore], (next: TStore[keyof TStore]) => Promise<void>] |
    [TStore, {
      setAll: (next: TStore) => Promise<void>;
      setMany: (upsert: TStore) => Promise<void>;
      setKey: (key: keyof TStore, value: TStore[keyof TStore]) => Promise<void>;
      deleteKey: (key: keyof TStore) => Promise<void>;
    }]
  {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('PersistKeyValue provider missing');

    const setAll = async (next: TStore) => {
      const res = await fetch(`${endpoint}/_bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ upsert: next }),
      });
      if (!res.ok) throw new Error('bulk failed');
      await ctx.refresh();
    };

    const setMany = setAll;

    const setKey = async (k: keyof TStore, value: TStore[keyof TStore]) => {
      const res = await fetch(`${endpoint}/${encodeURIComponent(k as string)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error('write failed');
      await ctx.refresh();
    };

    const deleteKey = async (k: keyof TStore) => {
      const res = await fetch(`${endpoint}/${encodeURIComponent(k as string)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('delete failed');
      await ctx.refresh();
    };

    if (typeof key === 'string') {
      const value = ctx.state[key];
      const setter = async (next: any) => setKey(key, next);
      return [value, setter];
    }

    return [ctx.state, { setAll, setMany, setKey, deleteKey }];
  }

  return { PersistKeyValue: Provider, useKeyValue };
}

// ---- Collection: context + hook factory
export function createPersistCollection<TRecord extends (Record<string, any> & { id: string })>(endpoint: string) {
  type Arr = TRecord[];
  const Ctx = createContext<{
    state: Arr;
    setAll: (arr: Arr) => Promise<void>;
    refresh: () => Promise<void>;
  } | null>(null);

  function Provider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<Arr>([]);
    const coreRef = useRef<SyncCore<Arr>>(undefined);

    useEffect(() => {
      const core = new SyncCore<Arr>(endpoint, (data) => setState(Array.isArray(data) ? data : []));
      coreRef.current = core;
      core.fetchAll().catch(() => void 0);
      core.startSSE();
      return () => core.stop();
    }, []);

    const api = useMemo(() => ({
      state,
      setAll: async (arr: Arr) => {
        const arrWithIds = ensureIdsClient(arr);
        const res = await fetch(`${endpoint}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ data: arrWithIds }),
        });
        if (!res.ok) throw new Error('write failed');
        // Optimistic update (ids are stable client-side and preserved server-side)
        setState(arrWithIds);
      },
      refresh: async () => { await coreRef.current?.fetchAll(); },
    }), [state]);

    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
  }

  function useCollection(): [
    TRecord[],
    {
      setItems: (next: TRecord[]) => Promise<void>;
      setItem: (id: string, item: TRecord) => Promise<void>;        // replace whole object
      updateItem: (id: string, patch: Partial<TRecord>) => Promise<void>;     // shallow merge
      deleteItem: (id: string) => Promise<void>;
      addItem: (item: TRecord) => Promise<void>;
    }
  ] {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('PersistCollection provider missing');

    const setItems = async (next: TRecord[]) => {
      const withIds = ensureIdsClient(next);
      await ctx.setAll(withIds); // full-array PUT (LWW)
    };

    // Replace entire object by id (no merge)
    const setItem = async (id: string, item: TRecord) => {
      const withId = typeof item?.id === 'string' ? { ...item, id } : { ...item, id };
      const res = await fetch(`${endpoint}/item/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ item: withId }),
      });
      if (!res.ok) throw new Error('put failed');
      await ctx.refresh();
    };

    // Shallow merge patch into existing item by id
    const updateItem = async (id: string, patch: Partial<TRecord>) => {
      const res = await fetch(`${endpoint}/item/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ patch }),
      });
      if (!res.ok) throw new Error('patch failed');
      await ctx.refresh();
    };

    const deleteItem = async (id: string) => {
      const res = await fetch(`${endpoint}/item/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('delete failed');
      await ctx.refresh();
    };

    const addItem = async (item: TRecord) => {
      const withId = typeof item?.id === 'string' ? item : { ...item, id: randomId() };
      const res = await fetch(`${endpoint}/item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ item: withId }),
      });
      if (!res.ok) throw new Error('add failed');
      await ctx.refresh();
    };

    return [ctx.state, { setItems, setItem, updateItem, deleteItem, addItem }];
  }

  return { PersistCollection: Provider, useCollection };
}
