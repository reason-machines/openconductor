import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

let pending: Promise<void> = Promise.resolve();
let applied: number | undefined;

export function applyAppZoom(root: HTMLElement, zoom: number): Promise<void> {
  if (!isTauri()) {
    root.style.zoom = zoom === 1 ? "" : String(zoom);
    return Promise.resolve();
  }

  root.style.zoom = "";
  const run = pending.then(async () => {
    if (applied === zoom) return;
    await getCurrentWebview().setZoom(zoom);
    applied = zoom;
    root.style.setProperty("--webview-zoom", String(zoom));
  });
  pending = run.catch(() => undefined);
  return run;
}
