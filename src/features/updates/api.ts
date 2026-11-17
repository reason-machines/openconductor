import { Channel, Resource, invoke } from "@tauri-apps/api/core";

export interface AppUpdate {
  readonly version: string;
  readonly body: string | null;
  download(): Promise<void>;
  install(): Promise<void>;
  close(): Promise<void>;
}

class NativeUpdate extends Resource implements AppUpdate {
  private bytes: Resource | undefined;
  constructor(rid: number, readonly version: string, readonly body: string | null) { super(rid); }

  async download(): Promise<void> {
    const rid = await invoke<number>("plugin:updater|download", { rid: this.rid, onEvent: new Channel<unknown>() });
    if (!Number.isSafeInteger(rid) || rid < 0) throw new Error("Invalid updater download resource");
    this.bytes = new Resource(rid);
  }

  async install(): Promise<void> {
    if (!this.bytes) throw new Error("No downloaded update is available to install");
    await invoke("plugin:updater|install", { updateRid: this.rid, bytesRid: this.bytes.rid });
    this.bytes = undefined;
  }

  override async close(): Promise<void> {
    await this.bytes?.close();
    this.bytes = undefined;
    await super.close();
  }
}

export async function checkForUpdate(): Promise<AppUpdate | null> {
  const value = await invoke<unknown>("plugin:updater|check");
  if (value === null) return null;
  if (!value || typeof value !== "object" || !("rid" in value) || typeof value.rid !== "number" || !Number.isSafeInteger(value.rid) || value.rid < 0
    || !("version" in value) || typeof value.version !== "string" || value.version.length === 0
    || ("body" in value && value.body !== null && value.body !== undefined && typeof value.body !== "string")) {
    throw new Error("Invalid updater response");
  }
  return new NativeUpdate(value.rid, value.version, "body" in value && typeof value.body === "string" ? value.body : null);
}

export const restartApp = () => invoke<void>("plugin:process|restart");
