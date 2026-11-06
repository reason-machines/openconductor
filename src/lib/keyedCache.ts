// A small in-memory cache of the last value loaded per key, so a screen the user
// comes back to shows what it showed last time at once and refreshes behind it
// (stale-while-revalidate), as Conductor's TanStack queries do: its changes list
// (`useFilesChanged`, keyed per workspace) shows "Loading git status..." only
// while no data is cached for that workspace (`isLoading: data === undefined`,
// renderApp-D_fmY7hW.js near byte 2,840,267; parity/side-by-side/transitions).
//
// Entries are evicted least recently used once there are more than `limit`.

export interface KeyedCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
  readonly size: number;
}

export function keyedCache<V>(limit = 64): KeyedCache<V> {
  const map = new Map<string, V>();
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key) as V;
      // Most recently used last.
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, value);
      while (map.size > limit) map.delete(map.keys().next().value as string);
    },
    delete(key) {
      map.delete(key);
    },
    get size() {
      return map.size;
    },
  };
}
