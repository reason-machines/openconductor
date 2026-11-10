import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { subsystemStorage } from "../features/terminal/localStorage";
import { ROUTE_USER_STATE } from "../lib/local-storage/subsystems";
import { BUILTIN_SECTION_COLLAPSE_ID, CUSTOM_SECTION_COLLAPSE_ID, CustomSectionCollapse } from "./customSectionCollapse";

function reportStorageFailure(): void {
  console.error("[sidebar] Could not persist section collapse state");
}

export function useCustomSectionCollapse(): readonly [ReadonlySet<string>, (id: string) => void] {
  return useSectionCollapse(CUSTOM_SECTION_COLLAPSE_ID);
}

export function useBuiltinSectionCollapse(): readonly [ReadonlySet<string>, (id: string) => void] {
  return useSectionCollapse(BUILTIN_SECTION_COLLAPSE_ID);
}

function useSectionCollapse(storageId: string): readonly [ReadonlySet<string>, (id: string) => void] {
  const [store] = useState(() => new CustomSectionCollapse(subsystemStorage(ROUTE_USER_STATE.name, ROUTE_USER_STATE.sizeLimit), storageId));
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
