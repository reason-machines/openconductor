// Synthetic QA-only storage payload. No application modules or network requests.
export async function storageStage(phase, token, env = globalThis) {
  if (!['write', 'read'].includes(phase) || !/^[a-f0-9]{32}$/.test(token)) {
    throw new Error('invalid QA storage phase/token');
  }
  if (!env.isSecureContext || !env.localStorage || !env.indexedDB?.databases || !env.caches) {
    throw new Error('required secure storage APIs unavailable');
  }
  const key = `oc-native-qa-${token}`;
  const existingDatabases = await env.indexedDB.databases();
  const existingCaches = await env.caches.keys();
  if (env.localStorage.getItem(key) !== null || existingDatabases.some(db => db.name === key)
      || existingCaches.includes(key)) {
    throw new Error('synthetic storage survived or fixture was not fresh');
  }
  if (phase === 'read') {
    return { phase, local_storage: 'absent', indexed_db: 'absent', cache_storage: 'absent' };
  }
  env.localStorage.setItem(key, token);
  if (env.localStorage.getItem(key) !== token) throw new Error('localStorage write/read failed');
  const db = await new Promise((resolve, reject) => {
    const request = env.indexedDB.open(key, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('probe');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('probe', 'readwrite');
      tx.objectStore('probe').put(token, 'value');
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(new Error('IndexedDB write failed'));
    });
    const actual = await new Promise((resolve, reject) => {
      const request = db.transaction('probe').objectStore('probe').get('value');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('IndexedDB read failed'));
    });
    if (actual !== token) throw new Error('IndexedDB write/read failed');
  } finally {
    db.close();
  }
  const cache = await env.caches.open(key);
  // Cache.put writes a synthetic Response; it does not fetch this URL.
  const url = 'https://openconductor-native-qa.invalid/synthetic';
  await cache.put(url, new env.Response(token));
  const cached = await cache.match(url);
  if (!cached || await cached.text() !== token) throw new Error('CacheStorage write/read failed');
  return { phase, local_storage: 'written-read-back', indexed_db: 'written-read-back',
    cache_storage: 'written-read-back' };
}
