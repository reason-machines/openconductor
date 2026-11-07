import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { subsystemStorage } from "../features/terminal/localStorage";
import { ROUTE_USER_STATE } from "../lib/local-storage/subsystems";
import { CustomSectionCollapse } from "./customSectionCollapse";

function reportStorageFailure(): void {
  console.error("[sidebar] Could not persist custom-section collapse state");
}

export function useCustomSectionCollapse(): readonly [ReadonlySet<string>, (id: string) => void] {
  const [store] = useState(() => new CustomSectionCollapse(subsystemStorage(ROUTE_USER_STATE.name, ROUTE_USER_STATE.sizeLimit)));
  const collapsed = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.load().then(() => store.flush()).catch(reportStorageFailure);
  }, [store]);
  const toggle = useCallback((id: string) => {
    store.toggle(id);
    void store.flush().catch(reportStorageFailure);
  }, [store]);
  return [collapsed, toggle];
}
