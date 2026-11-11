import { useSyncExternalStore } from "react";
import { agentsTabFrom, type AgentsTab } from "./agents/kitModel.ts";

const PROVIDER_TAB_CHANGED = "openconductor:provider-tab-changed";

export function readProviderTab(): AgentsTab {
  return agentsTabFrom(new URLSearchParams(window.location.search).get("providerTab"));
}

export function subscribeProviderTab(onChange: () => void): () => void {
  window.addEventListener(PROVIDER_TAB_CHANGED, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(PROVIDER_TAB_CHANGED, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export function selectProviderTab(tab: AgentsTab): void {
  const url = new URL(window.location.href);
  url.searchParams.set("providerTab", tab);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(PROVIDER_TAB_CHANGED));
}

export function useProviderTab(): AgentsTab {
  return useSyncExternalStore(subscribeProviderTab, readProviderTab, () => "reason");
}
