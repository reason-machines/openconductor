// parity:chat.attachments:drag-window
// Window-level file drag/drop using Tauri's onDragDropEvent.
//
// Evidence: REA bundle fCe().onDragDropEvent consumer analysis, Conductor 0.87.6.
// Two listeners in Conductor's bundle:
//   Consumer 1 (overlay): `isDragging` turns true on `enter`, false on `leave`/`drop`.
//   Consumer 2 (handler): `onDrop(paths)` fires with native OS paths on `drop`.
//
// Native path → PickedFile conversion: convertFileSrc (Tauri asset protocol) + fetch.
// Requires tauri-plugin-fs = { features = ["watch"] } already in Cargo.toml and
// the asset protocol scope to include the dropped paths (default: app data dir only;
// production scope may need "scope": ["$HOME/**"] in tauri.conf.json — REA_GAP:
// Conductor's exact asset protocol scope is not established from bundle evidence).
//
// NATIVE_NOT_RUN: live drop, overlay rendering, path scope in a signed build.

import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { convertFileSrc } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";

/** A native-path file compatible with composerSession's PickedFile duck type. */
export interface WindowDropFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Read a native OS path as bytes using the Tauri asset protocol.
 * Returns null when the fetch fails (file not accessible via the protocol scope).
 */
export async function nativePathToFile(path: string): Promise<WindowDropFile | null> {
  try {
    const url = convertFileSrc(path);
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    const name = path.split(/[\\/]/).pop() ?? path;
    return { name, size: bytes.byteLength, arrayBuffer: () => Promise.resolve(bytes) };
  } catch {
    return null;
  }
}

/**
 * Subscribe to Tauri window-level file drag/drop events (Conductor's fCe().onDragDropEvent).
 *
 * @param onDrop  Called with the dropped native paths when the user releases.
 * @returns       `isDragging` — true while files are being dragged over the window.
 */
export function useWindowDragDrop(onDrop: (paths: string[]) => void): boolean {
  const [isDragging, setIsDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    if (!inTauri()) return;
    let cleanup: (() => void) | undefined;
    let webview: ReturnType<typeof getCurrentWebview>;
    try {
      webview = getCurrentWebview();
    } catch {
      // getCurrentWebview() requires a real Tauri runtime (accesses window.__TAURI_INTERNALS__).
      // In test sandboxes that mock isTauri()→true but lack the full globals, exit safely.
      return;
    }
    webview
      .onDragDropEvent((event) => {
        const { type } = event.payload;
        if (type === "enter") {
          setIsDragging(true);
        } else if (type === "drop") {
          setIsDragging(false);
          const paths = (event.payload as { paths?: string[] }).paths ?? [];
          if (paths.length > 0) onDropRef.current(paths);
        } else if (type === "leave") {
          setIsDragging(false);
        }
      })
      .then((unlisten) => {
        cleanup = unlisten;
      });
    return () => cleanup?.();
  }, []);

  return isDragging;
}
