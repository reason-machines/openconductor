import { useCallback, useSyncExternalStore } from "react";
import { inTauri } from "../../backend";
import { persistedIn, ROUTE_USER_STATE } from "../../lib/local-storage/index.ts";
import { ChangesPresentationStore, type ChangesUpdate, type ChangesStorage } from "./changesPresentation.ts";

let store: ChangesPresentationStore | undefined;
function presentationStore() {
  if (!store) {
    const key = (id: string) => `local-storage:${ROUTE_USER_STATE.name}:${id}`;
    const browser: ChangesStorage = {
      getItem: async (id) => localStorage.getItem(key(id)),
      setItem: async (id, value) => localStorage.setItem(key(id), value),
    };
    store = new ChangesPresentationStore(inTauri() ? persistedIn(ROUTE_USER_STATE) : browser);
  }
  return store;
}

export function useChangesPresentation(workspaceId: string) {
  const store = presentationStore();
  const snapshot = useCallback(() => store.get(workspaceId), [store, workspaceId]);
  const value = useSyncExternalStore(store.subscribe, snapshot, snapshot);
  const update = (change: ChangesUpdate) => store.update(workspaceId, change);
  return { presentation: value, update };
}
