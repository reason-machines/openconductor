import type { AsyncKeyValue } from "../features/terminal/tabList.ts";

export const CUSTOM_SECTION_COLLAPSE_ID = "sidebar-custom-section-collapse-v1";
export const BUILTIN_SECTION_COLLAPSE_ID = "sidebar-builtin-collapse-v1";
export const PINNED_COLLAPSE_KEY = "navigation-section-pinned";
export const MAIN_COLLAPSE_KEY = "navigation-section-main";

function parseCollapsed(raw: string | null): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    return Array.isArray(value) && value.every((id): id is string => typeof id === "string") ? new Set(value) : new Set();
  } catch {
    return new Set();
  }
}

export class CustomSectionCollapse {
  private snapshot: ReadonlySet<string> = new Set();
  private pending = new Map<string, boolean>();
  private loaded = false;
  private reading: Promise<void> | undefined;
  private writes: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private readonly storage: AsyncKeyValue;
  private readonly storageId: string;

  constructor(storage: AsyncKeyValue, storageId = CUSTOM_SECTION_COLLAPSE_ID) {
    this.storage = storage;
    this.storageId = storageId;
  }

  load(): Promise<void> {
    this.reading ??= this.hydrate();
    return this.reading;
  }

  private async hydrate(): Promise<void> {
    const collapsed = new Set(parseCollapsed(await this.storage.getItem(this.storageId)));
    for (const [id, value] of this.pending) {
      if (value) collapsed.add(id);
      else collapsed.delete(id);
    }
    this.snapshot = collapsed;
    this.loaded = true;
    if (this.pending.size) this.save();
    this.pending.clear();
    this.emit();
  }

  readonly getSnapshot = (): ReadonlySet<string> => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly toggle = (id: string): void => {
    const collapsed = new Set(this.snapshot);
    if (!collapsed.delete(id)) collapsed.add(id);
    this.snapshot = collapsed;
    if (this.loaded) this.save();
    else this.pending.set(id, collapsed.has(id));
    this.emit();
  };

  private save(): void {
    const serialized = JSON.stringify([...this.snapshot]);
    this.writes = this.writes.catch(() => {}).then(() => this.storage.setItem(this.storageId, serialized));
  }

  async flush(): Promise<void> {
    await this.load();
    await this.writes;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
