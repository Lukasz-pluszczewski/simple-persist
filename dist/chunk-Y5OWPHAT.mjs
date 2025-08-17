import {
  CollectionClient,
  KeyValueClient,
  SyncSession,
  ensureIdsClient,
  randomId
} from "./chunk-CDHIZ4TX.mjs";
import {
  __export
} from "./chunk-7P6ASYW6.mjs";

// src/react.tsx
var react_exports = {};
__export(react_exports, {
  createPersistCollection: () => createPersistCollection,
  createPersistKeyValue: () => createPersistKeyValue
});
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { jsx } from "react/jsx-runtime";
function createPersistKeyValue(endpoint) {
  const Ctx = createContext(null);
  function Provider({ children }) {
    const [state, setState] = useState({});
    const clientRef = useRef(new KeyValueClient(endpoint));
    const sessionRef = useRef();
    useEffect(() => {
      const session = new SyncSession(
        endpoint,
        (data) => setState(data ?? {})
      );
      sessionRef.current = session;
      session.fetchAll().catch(() => void 0);
      session.startSSE();
      return () => session.stop();
    }, []);
    const api = useMemo(
      () => ({
        state,
        set: async (key, value) => {
          await clientRef.current.setKey(key, value);
          setState((prev) => ({ ...prev, [key]: value }));
        },
        refresh: async () => {
          var _a;
          await ((_a = sessionRef.current) == null ? void 0 : _a.fetchAll());
        }
      }),
      [state]
    );
    return /* @__PURE__ */ jsx(Ctx.Provider, { value: api, children });
  }
  function useKeyValue(key) {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error("PersistKeyValue provider missing");
    const client = useRef(new KeyValueClient(endpoint)).current;
    const setAll = async (next) => {
      await client.bulk(next);
      await ctx.refresh();
    };
    const setMany = setAll;
    const setKey = async (k, value) => {
      await client.setKey(k, value);
      await ctx.refresh();
    };
    const deleteKey = async (k) => {
      await client.deleteKey(k);
      await ctx.refresh();
    };
    if (typeof key === "string") {
      const value = ctx.state[key];
      const setter = async (next) => setKey(key, next);
      return [value, setter];
    }
    return [ctx.state, { setAll, setMany, setKey, deleteKey }];
  }
  return { PersistKeyValue: Provider, useKeyValue };
}
function createPersistCollection(endpoint) {
  const Ctx = createContext(null);
  function Provider({ children }) {
    const [state, setState] = useState([]);
    const clientRef = useRef(new CollectionClient(endpoint));
    const sessionRef = useRef();
    useEffect(() => {
      const session = new SyncSession(
        endpoint,
        (data) => setState(Array.isArray(data) ? data : [])
      );
      sessionRef.current = session;
      session.fetchAll().catch(() => void 0);
      session.startSSE();
      return () => session.stop();
    }, []);
    const api = useMemo(
      () => ({
        state,
        setAll: async (arr) => {
          await clientRef.current.putAll(ensureIdsClient(arr));
          setState(arr);
        },
        refresh: async () => {
          var _a;
          await ((_a = sessionRef.current) == null ? void 0 : _a.fetchAll());
        }
      }),
      [state]
    );
    return /* @__PURE__ */ jsx(Ctx.Provider, { value: api, children });
  }
  function useCollection() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error("PersistCollection provider missing");
    const client = useRef(new CollectionClient(endpoint)).current;
    const setItems = async (next) => {
      await client.putAll(ensureIdsClient(next));
      await ctx.refresh();
    };
    const setItem = async (id, item) => {
      if (item.id && item.id !== id)
        throw new Error(
          "Unexpected id mismatch in setItem second parameter. You cannot update item's id"
        );
      await client.setItem(id, item);
      await ctx.refresh();
    };
    const updateItem = async (id, patch) => {
      await client.updateItem(id, patch);
      await ctx.refresh();
    };
    const deleteItem = async (id) => {
      await client.deleteItem(id);
      await ctx.refresh();
    };
    const addItem = async (item) => {
      const withId = typeof (item == null ? void 0 : item.id) === "string" ? item : { ...item, id: randomId() };
      await client.add(withId);
      await ctx.refresh();
    };
    return [ctx.state, { setItems, setItem, updateItem, deleteItem, addItem }];
  }
  return { PersistCollection: Provider, useCollection };
}

export {
  createPersistKeyValue,
  createPersistCollection,
  react_exports
};
