import React from 'react';

declare function createPersistKeyValue(endpoint: string): {
    PersistKeyValue: ({ children }: {
        children: React.ReactNode;
    }) => any;
    useKeyValue: {
        (key: string): [any, (next: any) => Promise<void>];
        (): [Record<string, any>, {
            setAll: (next: Record<string, any>) => Promise<void>;
            setMany: (upsert: Record<string, any>) => Promise<void>;
            setKey: (key: string, value: any) => Promise<void>;
            deleteKey: (key: string) => Promise<void>;
        }];
    };
};
declare function createPersistCollection(endpoint: string): {
    PersistCollection: ({ children }: {
        children: React.ReactNode;
    }) => any;
    useCollection: () => [any[], {
        setItems: (next: any[]) => Promise<void>;
        setItem: (id: string, item: any) => Promise<void>;
        updateItem: (id: string, patch: any) => Promise<void>;
        deleteItem: (id: string) => Promise<void>;
        addItem: (item: any) => Promise<void>;
    }];
};

declare const react_createPersistCollection: typeof createPersistCollection;
declare const react_createPersistKeyValue: typeof createPersistKeyValue;
declare namespace react {
  export { react_createPersistCollection as createPersistCollection, react_createPersistKeyValue as createPersistKeyValue };
}

export { createPersistCollection as a, createPersistKeyValue as c, react as r };
