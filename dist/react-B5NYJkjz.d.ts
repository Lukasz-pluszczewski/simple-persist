import React from 'react';

declare function createPersistKeyValue<TStore extends Record<string, any>>(endpoint: string): {
    PersistKeyValue: ({ children }: {
        children: React.ReactNode;
    }) => any;
    useKeyValue: {
        <TKey extends keyof TStore>(key: TKey): [TStore[TKey], (next: TStore[TKey]) => Promise<void>];
        (): [TStore, {
            setAll: (next: TStore) => Promise<void>;
            setMany: (upsert: TStore) => Promise<void>;
            setKey: (key: keyof TStore, value: TStore[keyof TStore]) => Promise<void>;
            deleteKey: (key: keyof TStore) => Promise<void>;
        }];
    };
};
declare function createPersistCollection<TRecord extends (Record<string, any> & {
    id: string;
})>(endpoint: string): {
    PersistCollection: ({ children }: {
        children: React.ReactNode;
    }) => any;
    useCollection: () => [TRecord[], {
        setItems: (next: TRecord[]) => Promise<void>;
        setItem: (id: string, item: TRecord) => Promise<void>;
        updateItem: (id: string, patch: Partial<TRecord>) => Promise<void>;
        deleteItem: (id: string) => Promise<void>;
        addItem: (item: TRecord) => Promise<void>;
    }];
};

declare const react_createPersistCollection: typeof createPersistCollection;
declare const react_createPersistKeyValue: typeof createPersistKeyValue;
declare namespace react {
  export { react_createPersistCollection as createPersistCollection, react_createPersistKeyValue as createPersistKeyValue };
}

export { createPersistCollection as a, createPersistKeyValue as c, react as r };
