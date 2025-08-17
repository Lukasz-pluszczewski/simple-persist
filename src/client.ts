// =============================
// src/client.ts (vanilla client core)
// Framework-agnostic client with SSE + polling and HTTP helpers
// Used by React adapter but can be used from any UI framework
// =============================

export function randomId(): string {
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

export function ensureIdsClient(arr: any[]): any[] {
  return (arr ?? []).map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return typeof (item as any).id === 'string'
        ? item
        : { ...item, id: randomId() };
    }
    return { id: randomId(), value: item };
  });
}

export class SyncSession<T> {
  private endpoint: string;
  private onChange: (data: T) => void;
  private pollMs: number;
  private sse?: EventSource;
  private timer?: number;
  private current?: { data: T; version: number };

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
      sse.addEventListener('update', () => this.fetchAll().catch(() => void 0));
      sse.onerror = () => {
        sse.close();
        this.sse = undefined;
        this.startPolling();
      };
      this.sse = sse;
    } catch {
      this.startPolling();
    }
  }

  startPolling() {
    const tick = () => this.fetchAll().catch(() => void 0);
    // @ts-ignore
    this.timer = window.setInterval(tick, this.pollMs);
  }

  stop() {
    if (this.sse) this.sse.close();
    if (this.timer) {
      /* @ts-ignore */ clearInterval(this.timer);
    }
  }
}

// HTTP helpers
export class KeyValueClient<TStore extends Record<string, any>> {
  constructor(public endpoint: string) {
    this.endpoint = endpoint.replace(/\/?$/, '');
  }
  async getAll() {
    return (
      await (
        await fetch(this.endpoint + '/', { credentials: 'include' })
      ).json()
    ).data as TStore;
  }
  async setKey(key: string, value: any) {
    const r = await fetch(`${this.endpoint}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ value }),
    });
    if (!r.ok) throw new Error('write failed');
  }
  async deleteKey(key: string) {
    const r = await fetch(`${this.endpoint}/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!r.ok) throw new Error('delete failed');
  }
  async bulk(upsert?: Partial<TStore>, del?: string[]) {
    const r = await fetch(`${this.endpoint}/_bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ upsert, delete: del }),
    });
    if (!r.ok) throw new Error('bulk failed');
  }
}

export class CollectionClient<TRecord extends { id: string }> {
  constructor(public endpoint: string) {
    this.endpoint = endpoint.replace(/\/?$/, '');
  }
  async getAll() {
    return (
      await (
        await fetch(this.endpoint + '/', { credentials: 'include' })
      ).json()
    ).data as TRecord[];
  }
  async putAll(arr: TRecord[]) {
    const r = await fetch(`${this.endpoint}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ data: ensureIdsClient(arr) }),
    });
    if (!r.ok) throw new Error('write failed');
  }
  async add(item: Partial<TRecord>) {
    const withId: TRecord = (
      typeof (item as any)?.id === 'string'
        ? item
        : { ...(item as any), id: randomId() }
    ) as TRecord;
    const r = await fetch(`${this.endpoint}/item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ item: withId }),
    });
    if (!r.ok) throw new Error('add failed');
    return withId;
  }
  async setItem(id: string, item: Omit<TRecord, 'id'>) {
    const r = await fetch(`${this.endpoint}/item/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ item: { ...(item as any), id } }),
    });
    if (!r.ok) throw new Error('put failed');
  }
  async updateItem(id: string, patch: Partial<TRecord>) {
    const r = await fetch(`${this.endpoint}/item/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ patch }),
    });
    if (!r.ok) throw new Error('patch failed');
  }
  async deleteItem(id: string) {
    const r = await fetch(`${this.endpoint}/item/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!r.ok) throw new Error('delete failed');
  }
}
