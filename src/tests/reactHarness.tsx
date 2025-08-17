import React, { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createPersistCollection, createPersistKeyValue } from '../react';

export interface KVApi {
  getMap: () => Record<string, any>;
  setAll: (m: Record<string, any>) => Promise<void>;
  setMany: (m: Record<string, any>) => Promise<void>;
  setKey: (k: string, v: any) => Promise<void>;
  deleteKey: (k: string) => Promise<void>;
}

export interface CollectionApi {
  getItems: () => any[];
  setItems: (arr: any[]) => Promise<void>;
  setItem: (id: string, item: any) => Promise<void>;
  updateItem: (id: string, patch: any) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  addItem: (item: any) => Promise<void>;
}

export function mountKV(baseURL: string, tenant = 'default') {
  const endpoint = `${baseURL}/kv?tenant=${tenant}`;
  const { PersistKeyValue, useKeyValue } = createPersistKeyValue(endpoint);

  const KVComp = forwardRef<KVApi>(function KVComp(_, ref) {
    const [map, { setAll, setMany, setKey, deleteKey }] = useKeyValue();
    useImperativeHandle(
      ref,
      () => ({
        getMap: () => map,
        setAll,
        setMany,
        setKey,
        deleteKey,
      }),
      [map]
    );
    return <pre data-testid={`kv-${tenant}`}>{JSON.stringify(map)}</pre>;
  });

  const utils = render(
    <PersistKeyValue>
      <KVComp />
    </PersistKeyValue>
  );

  return { ...utils };
}

export function mountCollection(baseURL: string, tenant = 'default') {
  const endpoint = `${baseURL}/todos?tenant=${tenant}`;
  const { PersistCollection, useCollection } =
    createPersistCollection(endpoint);

  const APIRef = React.createRef<CollectionApi>();

  const CollComp = forwardRef<CollectionApi>(function CollComp(_, ref) {
    const [items, { setItems, setItem, updateItem, deleteItem, addItem }] =
      useCollection();
    useImperativeHandle(
      ref,
      () => ({
        getItems: () => items,
        setItems,
        setItem,
        updateItem,
        deleteItem,
        addItem,
      }),
      [items]
    );
    return <pre data-testid={`coll-${tenant}`}>{JSON.stringify(items)}</pre>;
  });

  const utils = render(
    <PersistCollection>
      <CollComp ref={APIRef} />
    </PersistCollection>
  );

  return { ...utils, APIRef };
}

export { render, cleanup, screen, act, waitFor };
