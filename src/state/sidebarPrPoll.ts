// parity:sidebar.ws-status
// Which on-screen sidebar rows are due a PR lookup. Conductor (index chunk,
// REA-read as data) subscribes every row in `sidebarLocalWorkspaceIds` (the
// rows its IntersectionObserver sees, threshold 0.1) to PR info with
// `{ interval: 300000, actionPath: "load for workspace in sidebar" }` (`G5e`);
// the open workspace polls on its own every few seconds (`z5e`). Its
// scheduler (`_Ge.updatePolling`) fetches at once when the last update is
// older than the interval, then every interval, and batches the due
// workspaces of one repository into one request (`wGe` / `u6e`).

/** Conductor's `G5e.interval`. */
export const SIDEBAR_PR_INTERVAL_MS = 300_000;

export interface PrPollSub {
  workspaceId: string;
  repoPath: string;
}

/**
 * The due subscriptions grouped by repository path: never fetched, or last
 * fetched at least `interval` ago, and not already in flight.
 */
export function duePrPolls<S extends PrPollSub>(
  subs: Iterable<S>,
  lastFetch: ReadonlyMap<string, number>,
  inFlight: ReadonlySet<string>,
  now: number,
  interval = SIDEBAR_PR_INTERVAL_MS,
): Map<string, S[]> {
  const byRepo = new Map<string, S[]>();
  for (const s of subs) {
    if (inFlight.has(s.workspaceId)) continue;
    const last = lastFetch.get(s.workspaceId);
    if (last !== undefined && now - last < interval) continue;
    const group = byRepo.get(s.repoPath);
    if (group) group.push(s);
    else byRepo.set(s.repoPath, [s]);
  }
  return byRepo;
}

/** Milliseconds until the next subscription falls due (0 when one is due now). */
export function nextPrPollIn(subs: Iterable<PrPollSub>, lastFetch: ReadonlyMap<string, number>, now: number, interval = SIDEBAR_PR_INTERVAL_MS): number | null {
  let next: number | null = null;
  for (const s of subs) {
    const last = lastFetch.get(s.workspaceId);
    const wait = last === undefined ? 0 : Math.max(0, last + interval - now);
    next = next === null ? wait : Math.min(next, wait);
  }
  return next;
}

/** Workspaces Conductor polls: set up or ready (`isActive` in its workspace mapper). */
export function prPollable(state: string | undefined): boolean {
  return state === undefined || state === "ready" || state === "setting_up";
}

export interface PrPollTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * Conductor's scheduler (`_Ge`) for the sidebar: rows subscribe while on
 * screen, due rows of one repository go out as one batch, and one timer wakes
 * for the next due row. `fetch` resolves one result per sub, in order; a
 * failed batch is retried when its rows next fall due.
 */
export class PrPollScheduler<S extends PrPollSub> {
  private subs = new Map<string, S>();
  private lastFetch = new Map<string, number>();
  private inFlight = new Set<string>();
  private timer: unknown;
  private readonly fetch: (repoPath: string, subs: S[]) => Promise<void>;
  private readonly timers: PrPollTimers;
  private readonly interval: number;

  constructor(fetch: (repoPath: string, subs: S[]) => Promise<void>, timers: PrPollTimers, interval = SIDEBAR_PR_INTERVAL_MS) {
    this.fetch = fetch;
    this.timers = timers;
    this.interval = interval;
  }

  /** Poll `sub` until the returned function is called. */
  subscribe(sub: S): () => void {
    this.subs.set(sub.workspaceId, sub);
    this.schedule(0);
    return () => {
      if (this.subs.get(sub.workspaceId) === sub) this.subs.delete(sub.workspaceId);
    };
  }

  /** Another reader (the open workspace's own poll) just read this PR. */
  markFresh(workspaceId: string): void {
    this.lastFetch.set(workspaceId, this.timers.now());
  }

  private schedule(ms: number) {
    if (this.timer !== undefined) this.timers.clearTimeout(this.timer);
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, ms);
  }

  private flush() {
    const now = this.timers.now();
    for (const [repoPath, subs] of duePrPolls(this.subs.values(), this.lastFetch, this.inFlight, now, this.interval)) {
      for (const s of subs) {
        this.inFlight.add(s.workspaceId);
        this.lastFetch.set(s.workspaceId, now);
      }
      this.fetch(repoPath, subs)
        .catch(() => {})
        .finally(() => {
          for (const s of subs) this.inFlight.delete(s.workspaceId);
        });
    }
    const next = nextPrPollIn(this.subs.values(), this.lastFetch, this.timers.now(), this.interval);
    if (next !== null) this.schedule(Math.max(next, 1000));
  }
}
