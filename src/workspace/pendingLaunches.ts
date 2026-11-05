// Workspaces being created, shown as an inert "Untitled" row at the top of their
// repository's sidebar group until the real workspace arrives. After
// Conductor's `Y5e` pendingLaunches store (renderApp chunk, REA-extracted, read
// as data): `addPendingLaunch` replaces an entry with the same id and drops it
// again after 120 s; `removePendingLaunch` runs on creation or failure.

export const PENDING_LAUNCH_TIMEOUT_MS = 120 * 1000;

export interface PendingLaunch {
  id: string;
  repoId: string;
  startedAt: number;
}

export function addLaunch(list: readonly PendingLaunch[], launch: PendingLaunch): PendingLaunch[] {
  return [...list.filter((l) => l.id !== launch.id), launch];
}

export function removeLaunch(list: readonly PendingLaunch[], id: string): readonly PendingLaunch[] {
  return list.some((l) => l.id === id) ? list.filter((l) => l.id !== id) : list;
}

/** The timeout drops a launch only if it was not re-added since (Conductor compares `startedAt`). */
export function expireLaunch(list: readonly PendingLaunch[], id: string, startedAt: number): readonly PendingLaunch[] {
  return list.find((l) => l.id === id)?.startedAt === startedAt ? removeLaunch(list, id) : list;
}

/** Pending launch ids of one repository, oldest first. */
export function launchesForRepo(list: readonly PendingLaunch[], repoId: string): string[] {
  return list.filter((l) => l.repoId === repoId).map((l) => l.id);
}

let launches: readonly PendingLaunch[] = [];
const subscribers = new Set<() => void>();

function set(next: readonly PendingLaunch[]) {
  if (next === launches) return;
  launches = next;
  for (const s of subscribers) s();
}

export function addPendingLaunch(id: string, repoId: string, now = Date.now()) {
  set(addLaunch(launches, { id, repoId, startedAt: now }));
  setTimeout(() => set(expireLaunch(launches, id, now)), PENDING_LAUNCH_TIMEOUT_MS);
}

export function removePendingLaunch(id: string) {
  set(removeLaunch(launches, id));
}

export function getPendingLaunches(): readonly PendingLaunch[] {
  return launches;
}

export function subscribePendingLaunches(cb: () => void) {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
