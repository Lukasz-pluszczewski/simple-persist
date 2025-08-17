import * as express_serve_static_core from 'express-serve-static-core';
import { Request, Response } from 'express';

type TenantResolver = (req: Request, res: Response) => string | Error;
interface PersistOptionsKV {
    validation?: (key: string, value: any) => boolean;
    getTenant?: TenantResolver;
    baseDir?: string;
}
declare function persistKeyValue(name: string, opts?: PersistOptionsKV): express_serve_static_core.Router;
interface PersistOptionsCollection {
    validation?: (item: any) => boolean;
    getTenant?: TenantResolver;
    baseDir?: string;
}
declare function persistCollection(name: string, opts?: PersistOptionsCollection): express_serve_static_core.Router;

type express_PersistOptionsCollection = PersistOptionsCollection;
type express_PersistOptionsKV = PersistOptionsKV;
type express_TenantResolver = TenantResolver;
declare const express_persistCollection: typeof persistCollection;
declare const express_persistKeyValue: typeof persistKeyValue;
declare namespace express {
  export { type express_PersistOptionsCollection as PersistOptionsCollection, type express_PersistOptionsKV as PersistOptionsKV, type express_TenantResolver as TenantResolver, express_persistCollection as persistCollection, express_persistKeyValue as persistKeyValue };
}

export { type PersistOptionsKV as P, type TenantResolver as T, type PersistOptionsCollection as a, persistCollection as b, express as e, persistKeyValue as p };
