// The app's local-storage client: the backend store in the desktop app, an
// in-memory stand-in in the browser build.

import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";
import { LocalStorageClient, browserLocalStorage, persistStorage } from "./client.ts";
import { ComposerDrafts } from "./composerDrafts.ts";
import { memoryInvoke } from "./memory.ts";
import { BROWSER_LOCAL_STORAGE, type Subsystem } from "./subsystems.ts";

let client: LocalStorageClient | undefined;

export function localStorageClient(): LocalStorageClient {
  client ??= new LocalStorageClient(inTauri() ? invoke : memoryInvoke());
  return client;
}

/** Storage for a persisted store kept as one entry of `subsystem`. */
export function persistedIn(subsystem: Subsystem) {
  return persistStorage(localStorageClient(), subsystem);
}

/** The `browser-local-storage` subsystem as an async Storage. */
export function appBrowserStorage() {
  return browserLocalStorage(localStorageClient(), BROWSER_LOCAL_STORAGE);
}

export * from "./client.ts";
export * from "./subsystems.ts";

let drafts: ComposerDrafts | undefined;

/** Composer drafts kept in the `composer-drafts` subsystem. */
export function composerDrafts(): ComposerDrafts {
  drafts ??= new ComposerDrafts(localStorageClient());
  return drafts;
}
