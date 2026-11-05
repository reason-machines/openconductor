// parity:diff.file-render:ui
// Conductor highlights code off the main thread: its app root is wrapped in
// Pierre's WorkerPoolContextProvider with two module workers built from Pierre's
// worker script, shiki-wasm, the token transformer and ten preloaded languages,
// and a child effect pushes the code theme to the pool whenever it changes
// (REA, renderApp chunk of 0.87.6: tJr / eJr, worker-C5Xpc1Wy.js).
// Every Pierre CodeView below the provider reads the pool from context; when a
// worker fails, Pierre falls back to highlighting on the main thread.
import { useEffect, useState, type ReactNode } from "react";
import { WorkerPoolContextProvider, useWorkerPool, type WorkerPoolOptions } from "@pierre/diffs/react";
import type { WorkerInitializationRenderOptions } from "@pierre/diffs/worker";
import PierreWorker from "@pierre/diffs/worker/worker.js?worker";
import { useDiffTheme } from "./useDiffTheme.ts";

/** Pool settings from Conductor's provider: Pierre's own worker script, two workers. */
export const POOL_OPTIONS: WorkerPoolOptions = {
  workerFactory: () => new PierreWorker({ name: "pierre-diffs" }),
  poolSize: 2,
};

/** Languages Conductor's pool loads up front; others load on first use. */
export const PRELOADED_LANGS = ["typescript", "tsx", "javascript", "jsx", "css", "html", "json", "markdown", "python", "rust"] as const;

type CodeTheme = { dark: string; light: string };

export function highlighterOptions(theme: CodeTheme): WorkerInitializationRenderOptions {
  return { theme, useTokenTransformer: true, preferredHighlighter: "shiki-wasm", langs: [...PRELOADED_LANGS] };
}

// The pool is created once (Pierre keeps it as a singleton), so later theme
// changes reach the workers through setRenderOptions, as Conductor's eJr does.
function SyncTheme({ dark, light }: CodeTheme) {
  const pool = useWorkerPool();
  useEffect(() => {
    void pool?.setRenderOptions({ theme: { dark, light } }).catch(() => {});
  }, [pool, dark, light]);
  return null;
}

export function DiffWorkerPool({ children }: { children: ReactNode }) {
  // Conductor's provider reads the Code theme setting (Dgi) for both the pool's first options and SyncTheme.
  const theme = useDiffTheme();
  const [initial] = useState(() => highlighterOptions(theme));
  return (
    <WorkerPoolContextProvider poolOptions={POOL_OPTIONS} highlighterOptions={initial}>
      <SyncTheme dark={theme.dark} light={theme.light} />
      {children}
    </WorkerPoolContextProvider>
  );
}
