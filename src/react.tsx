// =============================
// src/react.tsx (React adapter built on vanilla client)
// =============================

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Optional } from 'ts-toolbelt/out/Object/Optional';
import {
  CollectionClient,
  ensureIdsClient,
  KeyValueClient,
  randomId,
  SyncSession,
} from './client';

export function createPersistKeyValue<TStore extends Record<string, any>>(
  endpoint: string
) {
  const Ctx = createContext<{
    state: TStore;
    set: (key: string, value: any) => Promise<void>;
    refresh: () => Promise<void>;
  } | null>(null);

  function Provider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<TStore>({} as TStore);
    const clientRef = useRef(new KeyValueClient<TStore>(endpoint));
    const sessionRef = useRef<SyncSession<TStore>>();

    useEffect(() => {
      const session = new SyncSession<TStore>(endpoint, (data) =>
        setState((data ?? {}) as TStore)
      );
      sessionRef.current = session;
      session.fetchAll().catch(() => void 0);
      session.startSSE();
      return () => session.stop();
    }, []);

    const api = useMemo(
      () => ({
        state,
        set: async (key: string, value: any) => {
          await clientRef.current.setKey(key, value);
          setState((prev) => ({ ...(prev as any), [key]: value }) as TStore);
        },
        refresh: async () => {
          await sessionRef.current?.fetchAll();
        },
      }),
      [state]
    );

    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
  }

  function useKeyValue<TKey extends keyof TStore>(
    key: TKey
  ): [TStore[TKey], (next: TStore[TKey]) => Promise<void>];
  function useKeyValue(): [
    TStore,
    {
      setAll: (next: TStore) => Promise<void>;
      setMany: (upsert: TStore) => Promise<void>;
      setKey: (key: keyof TStore, value: TStore[keyof TStore]) => Promise<void>;
      deleteKey: (key: keyof TStore) => Promise<void>;
    },
  ];
  function useKeyValue(key?: string): any {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('PersistKeyValue provider missing');

    const client = useRef(new KeyValueClient<TStore>(endpoint)).current;

    const setAll = async (next: TStore) => {
      await client.bulk(next);
      await ctx.refresh();
    };
    const setMany = setAll;
    const setKey = async (k: keyof TStore, value: TStore[keyof TStore]) => {
      await client.setKey(k as string, value);
      await ctx.refresh();
    };
    const deleteKey = async (k: keyof TStore) => {
      await client.deleteKey(k as string);
      await ctx.refresh();
    };

    if (typeof key === 'string') {
      const value = (ctx.state as any)[key];
      const setter = async (next: any) => setKey(key as any, next);
      return [value, setter];
    }
    return [ctx.state, { setAll, setMany, setKey, deleteKey }];
  }

  return { PersistKeyValue: Provider, useKeyValue };
}

export function createPersistCollection<
  TRecord extends Record<string, any> & { id: string },
>(endpoint: string) {
  type Arr = TRecord[];
  const Ctx = createContext<{
    state: Arr;
    setAll: (arr: Arr) => Promise<void>;
    refresh: () => Promise<void>;
  } | null>(null);

  function Provider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<Arr>([] as Arr);
    const clientRef = useRef(new CollectionClient<TRecord>(endpoint));
    const sessionRef = useRef<SyncSession<Arr>>();

    useEffect(() => {
      const session = new SyncSession<Arr>(endpoint, (data) =>
        setState(Array.isArray(data) ? (data as Arr) : ([] as Arr))
      );
      sessionRef.current = session;
      session.fetchAll().catch(() => void 0);
      session.startSSE();
      return () => session.stop();
    }, []);

    const api = useMemo(
      () => ({
        state,
        setAll: async (arr: Arr) => {
          await clientRef.current.putAll(ensureIdsClient(arr) as Arr);
          setState(arr as Arr);
        },
        refresh: async () => {
          await sessionRef.current?.fetchAll();
        },
      }),
      [state]
    );

    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
  }

  function useCollection(): [
    TRecord[],
    {
      setItems: (next: Optional<TRecord, 'id'>[]) => Promise<void>;
      setItem: (id: string, item: Omit<TRecord, 'id'>) => Promise<void>;
      updateItem: (id: string, patch: Partial<TRecord>) => Promise<void>;
      deleteItem: (id: string) => Promise<void>;
      addItem: (item: Optional<TRecord, 'id'>) => Promise<void>;
    },
  ] {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('PersistCollection provider missing');

    const client = useRef(new CollectionClient<TRecord>(endpoint)).current;

    const setItems = async (next: Optional<TRecord, 'id'>[]) => {
      await client.putAll(ensureIdsClient(next) as Arr);
      await ctx.refresh();
    };
    const setItem = async (id: string, item: Omit<TRecord, 'id'>) => {
      if ((item as any).id && (item as any).id !== id)
        throw new Error(
          "Unexpected id mismatch in setItem second parameter. You cannot update item's id"
        );
      await client.setItem(id, item as any);
      await ctx.refresh();
    };
    const updateItem = async (id: string, patch: Partial<TRecord>) => {
      await client.updateItem(id, patch);
      await ctx.refresh();
    };
    const deleteItem = async (id: string) => {
      await client.deleteItem(id);
      await ctx.refresh();
    };
    const addItem = async (item: Optional<TRecord, 'id'>) => {
      const withId =
        typeof (item as any)?.id === 'string'
          ? (item as any)
          : { ...(item as any), id: randomId() };
      await client.add(withId as any);
      await ctx.refresh();
    };

    return [ctx.state, { setItems, setItem, updateItem, deleteItem, addItem }];
  }

  return { PersistCollection: Provider, useCollection };
}
