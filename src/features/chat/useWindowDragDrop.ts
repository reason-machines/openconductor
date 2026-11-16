// parity:chat.attachments:drag-window
// Window-level file drag/drop using Tauri's onDragDropEvent.
//
// Evidence: REA bundle fCe().onDragDropEvent consumer analysis, Conductor 0.87.6.
// Two listeners in Conductor's bundle:
//   Consumer 1 (overlay): `isDragging` turns true on `enter`, false on `leave`/`drop`.
//   Consumer 2 (handler): `onDrop(paths)` fires with native OS paths on `drop`.
//
// Native path → PickedFile conversion: tauri-plugin-fs readFile (IPC plugin:fs|read_file).
// Authorization: fs:allow-read-file + fs:scope { "path": "**/*" } in default.json — no
// additional configuration required. fetch(convertFileSrc) was NOT used because:
//   1. The CSP connect-src allows only "ipc: http://ipc.localhost", not "asset:".
//   2. No assetProtocol capability is configured in default.json.
//   Under a signed build, fetch(asset://…) would silently fail on arbitrary paths.
//
// NATIVE_NOT_RUN: live drop, overlay rendering, confirmed bytes in a signed build.

import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readFile } from "@tauri-apps/plugin-fs";
import { inTauri } from "../../backend";

/** A native-path file compatible with composerSession's PickedFile duck type. */
export interface WindowDropFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

// Read a native OS path as bytes via the Tauri IPC plugin:fs|read_file.
// Uses the already-granted fs:allow-read-file + fs:scope {path:"**/*"} capability;
// no asset protocol scope or CSP change required.
// Returns null when the file cannot be read (permission denied, path missing, etc.).
export async function nativePathToFile(path: string): Promise<WindowDropFile | null> {
  try {
    const bytes = await readFile(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    return { name, size: bytes.byteLength, arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer) };
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
