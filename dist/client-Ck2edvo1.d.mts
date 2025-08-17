declare function randomId(): string;
declare function ensureIdsClient(arr: any[]): any[];
declare class SyncSession<T> {
    private endpoint;
    private onChange;
    private pollMs;
    private sse?;
    private timer?;
    private current?;
    constructor(endpoint: string, onChange: (data: T) => void, pollMs?: number);
    private setState;
    fetchAll(path?: string): Promise<{
        data: T;
        version: number;
    }>;
    startSSE(): void;
    startPolling(): void;
    stop(): void;
}
declare class KeyValueClient<TStore extends Record<string, any>> {
    endpoint: string;
    constructor(endpoint: string);
    getAll(): Promise<TStore>;
    setKey(key: string, value: any): Promise<void>;
    deleteKey(key: string): Promise<void>;
    bulk(upsert?: Partial<TStore>, del?: string[]): Promise<void>;
}
declare class CollectionClient<TRecord extends {
    id: string;
}> {
    endpoint: string;
    constructor(endpoint: string);
    getAll(): Promise<TRecord[]>;
    putAll(arr: TRecord[]): Promise<void>;
    add(item: Partial<TRecord>): Promise<TRecord>;
    setItem(id: string, item: Omit<TRecord, 'id'>): Promise<void>;
    updateItem(id: string, patch: Partial<TRecord>): Promise<void>;
    deleteItem(id: string): Promise<void>;
}

type client_CollectionClient<TRecord extends {
    id: string;
}> = CollectionClient<TRecord>;
declare const client_CollectionClient: typeof CollectionClient;
type client_KeyValueClient<TStore extends Record<string, any>> = KeyValueClient<TStore>;
declare const client_KeyValueClient: typeof KeyValueClient;
type client_SyncSession<T> = SyncSession<T>;
declare const client_SyncSession: typeof SyncSession;
declare const client_ensureIdsClient: typeof ensureIdsClient;
declare const client_randomId: typeof randomId;
declare namespace client {
  export { client_CollectionClient as CollectionClient, client_KeyValueClient as KeyValueClient, client_SyncSession as SyncSession, client_ensureIdsClient as ensureIdsClient, client_randomId as randomId };
}

export { CollectionClient as C, KeyValueClient as K, SyncSession as S, client as c, ensureIdsClient as e, randomId as r };
