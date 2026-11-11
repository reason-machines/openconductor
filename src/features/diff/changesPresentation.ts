import { PERSIST_NAMES, routeStateKey } from "../../lib/local-storage/subsystems.ts";
import type { ChangesView } from "./changesTree.ts";

export interface ChangesPresentation {
  diffFileListMode: ChangesView;
  filePathFilter: string;
  collapsedDirectoryPaths: string[];
}
export type ChangesUpdate = Partial<ChangesPresentation> | ((previous: ChangesPresentation) => Partial<ChangesPresentation>);
export interface ChangesStorage {
  getItem(id: string): Promise<string | null>;
  setItem(id: string, value: string): Promise<void>;
}
const defaults = (): ChangesPresentation => ({ diffFileListMode: "flat", filePathFilter: "", collapsedDirectoryPaths: [] });
const routeKey = (workspaceId: string) => routeStateKey({ routeId: "workspace.changes", scope: [workspaceId] });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function parseChangesPresentation(value: unknown): ChangesPresentation {
  if (!object(value)) return defaults();
  return {
    diffFileListMode: value.diffFileListMode === "tree" ? "tree" : "flat",
    filePathFilter: typeof value.filePathFilter === "string" ? value.filePathFilter : "",
    collapsedDirectoryPaths: Array.isArray(value.collapsedDirectoryPaths) && value.collapsedDirectoryPaths.every((path): path is string => typeof path === "string") ? value.collapsedDirectoryPaths : [],
  };
}

export class ChangesPresentationStore {
  private routes: Record<string, unknown> = {};
  private readonly snapshots = new Map<string, ChangesPresentation>();
  private readonly pending = new Map<string, ChangesUpdate[]>();
  private readonly listeners = new Set<() => void>();
  private phase: "loading" | "ready" | "unavailable" = "loading";
  private reading: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  readonly ready: Promise<void>;
  private readonly storage: ChangesStorage;
  private readonly report: (message: string) => void;

  constructor(storage: ChangesStorage, report: (message: string) => void = console.error) {
    this.storage = storage;
    this.report = report;
    this.reading = this.hydrate();
    this.ready = this.reading;
  }

  private async hydrate() {
    this.phase = "loading";
    try {
      const raw: unknown = JSON.parse(await this.storage.getItem(PERSIST_NAMES.routeUserState) ?? "null");
      if (object(raw) && object(raw.state) && object(raw.state.routeStates)) this.routes = raw.state.routeStates;
    } catch {
      this.phase = "unavailable";
      this.report("[changes] Could not read saved Changes presentation");
      return;
    }
    for (const [workspaceId, changes] of this.pending) {
      for (const change of changes) {
        const previous = parseChangesPresentation(this.routes[routeKey(workspaceId)]);
        this.merge(workspaceId, typeof change === "function" ? change(previous) : change);
      }
    }
    this.snapshots.clear();
    this.phase = "ready";
    if (this.pending.size) this.save();
    this.pending.clear();
    this.emit();
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly isReady = () => this.phase === "ready";

  get(workspaceId: string): ChangesPresentation {
    let snapshot = this.snapshots.get(workspaceId);
    if (!snapshot) {
      snapshot = parseChangesPresentation(this.routes[routeKey(workspaceId)]);
      for (const change of this.pending.get(workspaceId) ?? []) snapshot = { ...snapshot, ...(typeof change === "function" ? change(snapshot) : change) };
      this.snapshots.set(workspaceId, snapshot);
    }
    return snapshot;
  }

  update(workspaceId: string, change: ChangesUpdate): void {
    const previous = this.get(workspaceId);
    const patch = typeof change === "function" ? change(previous) : change;
    this.snapshots.set(workspaceId, { ...previous, ...patch });
    if (this.phase === "ready") {
      this.merge(workspaceId, patch);
      this.save();
    } else {
      this.pending.set(workspaceId, [...this.pending.get(workspaceId) ?? [], change]);
      if (this.phase === "unavailable") this.reading = this.hydrate();
    }
    this.emit();
  }

  private merge(workspaceId: string, patch: Partial<ChangesPresentation>) {
    const key = routeKey(workspaceId);
    const previous = this.routes[key];
    this.routes[key] = { ...(object(previous) ? previous : {}), ...patch };
  }

  private save() {
    const serialized = JSON.stringify({ state: { routeStates: this.routes }, version: 0 });
    this.writes = this.writes.then(() => this.storage.setItem(PERSIST_NAMES.routeUserState, serialized)).catch(() => {
      this.report("[changes] Could not persist Changes presentation");
    });
  }

  async flush(): Promise<void> {
    await this.reading;
    await this.writes;
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
