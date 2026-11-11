import { previewUrl, type BrowserPage } from "./model.ts";

export interface BrowserPlacement {
  owner: symbol;
  workspaceId: string;
  url: string;
  rect: { left: number; top: number; width: number; height: number };
}

export interface BrowserSnapshot {
  pages: ReadonlyMap<string, BrowserPage>;
  placement: BrowserPlacement | null;
}

let snapshot: BrowserSnapshot = { pages: new Map(), placement: null };
const listeners = new Set<() => void>();
export const browserSnapshot = () => snapshot;
export function subscribeBrowser(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: BrowserSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function openBrowserPreview(workspaceId: string, value: string, reload = true): boolean {
  const parsed = previewUrl(value, typeof location === "undefined" ? undefined : location.origin);
  if (!workspaceId || !parsed) return false;
  const url = parsed.href;
  const previous = snapshot.pages.get(workspaceId);
  if (previous?.url === url && !reload) return true;
  const pages = new Map(snapshot.pages);
  pages.set(workspaceId, { workspaceId, url, reload: previous?.url === url ? previous.reload + Number(reload) : 0 });
  publish({ ...snapshot, pages });
  return true;
}

export function closeBrowserPreview(workspaceId: string): void {
  if (!snapshot.pages.has(workspaceId)) return;
  const pages = new Map(snapshot.pages);
  pages.delete(workspaceId);
  publish({ pages, placement: snapshot.placement?.workspaceId === workspaceId ? null : snapshot.placement });
}

export function placeBrowserPreview(placement: BrowserPlacement): void {
  const previous = snapshot.placement;
  if (previous?.owner === placement.owner && previous.workspaceId === placement.workspaceId && previous.url === placement.url &&
    previous.rect.left === placement.rect.left && previous.rect.top === placement.rect.top && previous.rect.width === placement.rect.width && previous.rect.height === placement.rect.height) return;
  publish({ ...snapshot, placement });
}

export function parkBrowserPreview(owner: symbol): void {
  if (snapshot.placement?.owner === owner) publish({ ...snapshot, placement: null });
}
