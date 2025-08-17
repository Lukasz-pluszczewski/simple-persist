import * as express_serve_static_core from 'express-serve-static-core';
import { Request, Response } from 'express';

type TenantResolver = (req: Request, res: Response) => string | Error;
type KeyValueValidation = (key: string, value: any) => boolean;
type CollectionValidation = (value: any) => boolean;
interface PersistOptionsKV {
    validation?: KeyValueValidation;
    getTenant?: TenantResolver;
    baseDir?: string;
}
interface PersistOptionsCollection {
    validation?: CollectionValidation;
    getTenant?: TenantResolver;
    baseDir?: string;
}
declare function persistKeyValue(name: string, opts?: PersistOptionsKV): express_serve_static_core.Router;
declare function persistCollection(name: string, opts?: PersistOptionsCollection): express_serve_static_core.Router;

type express_CollectionValidation = CollectionValidation;
type express_KeyValueValidation = KeyValueValidation;
type express_PersistOptionsCollection = PersistOptionsCollection;
type express_PersistOptionsKV = PersistOptionsKV;
type express_TenantResolver = TenantResolver;
declare const express_persistCollection: typeof persistCollection;
declare const express_persistKeyValue: typeof persistKeyValue;
declare namespace express {
  export { type express_CollectionValidation as CollectionValidation, type express_KeyValueValidation as KeyValueValidation, type express_PersistOptionsCollection as PersistOptionsCollection, type express_PersistOptionsKV as PersistOptionsKV, type express_TenantResolver as TenantResolver, express_persistCollection as persistCollection, express_persistKeyValue as persistKeyValue };
}

export { type CollectionValidation as C, type KeyValueValidation as K, type PersistOptionsKV as P, type TenantResolver as T, type PersistOptionsCollection as a, persistCollection as b, express as e, persistKeyValue as p };
