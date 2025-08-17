import { EventEmitter } from 'node:events';

type Tenant = string;
type KeyValueValidation = (key: string, value: any) => boolean;
type CollectionValidation = (value: any) => boolean;
interface CoreOptions {
    baseDir?: string;
}
interface KVOptions extends CoreOptions {
    validation?: KeyValueValidation;
}
interface CollectionOptions extends CoreOptions {
    validation?: CollectionValidation;
}
declare function genId(): string;
declare function normalizeCollection(data: any[]): any[];
interface KeyValueStoreAdapter {
    init(dir: string): Promise<void>;
    keys(): Promise<string[]>;
    getItem<T = any>(key: string): Promise<T | undefined>;
    setItem<T = any>(key: string, value: T): Promise<void>;
    removeItem(key: string): Promise<void>;
}
declare class NodePersistAdapter implements KeyValueStoreAdapter {
    private _storage;
    init(dir: string): Promise<void>;
    keys(): Promise<any>;
    getItem<T = any>(key: string): Promise<T>;
    setItem<T = any>(key: string, value: T): Promise<void>;
    removeItem(key: string): Promise<void>;
}
declare class UpdateHub {
    private hubs;
    hub(scope: string): EventEmitter<[never]>;
    emit(scope: string, payload: any): void;
    on(scope: string, listener: (payload: any) => void): () => EventEmitter<[never]>;
}
declare class KeyValueService {
    readonly baseDir: string;
    readonly name: string;
    readonly validation?: KeyValueValidation;
    readonly hub: UpdateHub;
    constructor(name: string, opts?: KVOptions, hub?: UpdateHub);
    scope(tenant: Tenant): string;
    private adapterFor;
    getAll(tenant: Tenant): Promise<Record<string, any>>;
    get(tenant: Tenant, key: string): Promise<any>;
    put(tenant: Tenant, key: string, value: any): Promise<void>;
    del(tenant: Tenant, key: string): Promise<void>;
    bulk(tenant: Tenant, upsert?: Record<string, any>, delKeys?: string[]): Promise<void>;
}
declare class CollectionService {
    readonly baseDir: string;
    readonly name: string;
    readonly validation?: CollectionValidation;
    readonly hub: UpdateHub;
    constructor(name: string, opts?: CollectionOptions, hub?: UpdateHub);
    scope(tenant: Tenant): string;
    private adapterFor;
    private readAll;
    private writeAll;
    getAll(tenant: Tenant): Promise<any[]>;
    putAll(tenant: Tenant, data: any[]): Promise<void>;
    add(tenant: Tenant, item: any): Promise<any>;
    put(tenant: Tenant, id: string, item: any): Promise<any>;
    patch(tenant: Tenant, id: string, patch: any): Promise<any>;
    del(tenant: Tenant, id: string): Promise<void>;
}

type server_CollectionOptions = CollectionOptions;
type server_CollectionService = CollectionService;
declare const server_CollectionService: typeof CollectionService;
type server_CollectionValidation = CollectionValidation;
type server_CoreOptions = CoreOptions;
type server_KVOptions = KVOptions;
type server_KeyValueService = KeyValueService;
declare const server_KeyValueService: typeof KeyValueService;
type server_KeyValueStoreAdapter = KeyValueStoreAdapter;
type server_KeyValueValidation = KeyValueValidation;
type server_NodePersistAdapter = NodePersistAdapter;
declare const server_NodePersistAdapter: typeof NodePersistAdapter;
type server_Tenant = Tenant;
type server_UpdateHub = UpdateHub;
declare const server_UpdateHub: typeof UpdateHub;
declare const server_genId: typeof genId;
declare const server_normalizeCollection: typeof normalizeCollection;
declare namespace server {
  export { type server_CollectionOptions as CollectionOptions, server_CollectionService as CollectionService, type server_CollectionValidation as CollectionValidation, type server_CoreOptions as CoreOptions, type server_KVOptions as KVOptions, server_KeyValueService as KeyValueService, type server_KeyValueStoreAdapter as KeyValueStoreAdapter, type server_KeyValueValidation as KeyValueValidation, server_NodePersistAdapter as NodePersistAdapter, type server_Tenant as Tenant, server_UpdateHub as UpdateHub, server_genId as genId, server_normalizeCollection as normalizeCollection };
}

export { type CollectionValidation as C, type KeyValueValidation as K, NodePersistAdapter as N, type Tenant as T, UpdateHub as U, type CoreOptions as a, type KVOptions as b, type CollectionOptions as c, type KeyValueStoreAdapter as d, KeyValueService as e, CollectionService as f, genId as g, normalizeCollection as n, server as s };
