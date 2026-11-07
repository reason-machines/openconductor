import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storageStage } from '../src-tauri/src/native_qa_storage.mjs';

function fixture() {
  const local = new Map();
  const databases = new Map();
  const caches = new Map();
  const env = {
    isSecureContext: true, Response,
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) },
    indexedDB: {
      databases: async () => [...databases.keys()].map(name => ({ name })),
      open(name) {
        const request = {};
        queueMicrotask(() => {
          const fresh = !databases.has(name);
          if (fresh) databases.set(name, new Map());
          const values = databases.get(name);
          request.result = {
            createObjectStore() {}, close() {},
            transaction(_name, mode) {
              const tx = {
                objectStore: () => ({
                  put(value, key) {
                    values.set(key, value);
                    queueMicrotask(() => tx.oncomplete());
                  },
                  get(key) {
                    const read = {};
                    queueMicrotask(() => { read.result = values.get(key); read.onsuccess(); });
                    return read;
                  },
                }),
              };
              assert.ok(mode === undefined || mode === 'readwrite');
              return tx;
            },
          };
          if (fresh) request.onupgradeneeded();
          request.onsuccess();
        });
        return request;
      },
    },
    caches: {
      keys: async () => [...caches.keys()],
      async open(name) {
        const cache = new Map();
        caches.set(name, cache);
        return { put: async (url, value) => cache.set(url, value), match: async url => cache.get(url) };
      },
    },
  };
  return { env, local, databases, caches };
}
const token = 'a'.repeat(32);

test('write stage performs and reads back all three stores', async () => {
  const { env, local, databases, caches } = fixture();
  assert.deepEqual(await storageStage('write', token, env), {
    phase: 'write', local_storage: 'written-read-back', indexed_db: 'written-read-back', cache_storage: 'written-read-back',
  });
  assert.equal(local.size, 1);
  assert.equal(databases.size, 1);
  assert.equal(caches.size, 1);
});

test('fresh relaunch read stage observes absence without creating stores', async () => {
  const { env, local, databases, caches } = fixture();
  assert.deepEqual(await storageStage('read', token, env), {
    phase: 'read', local_storage: 'absent', indexed_db: 'absent', cache_storage: 'absent',
  });
  assert.equal(local.size + databases.size + caches.size, 0);
});

test('persistence in any individual store refuses read and write phases', async () => {
  for (const store of ['local', 'databases', 'caches']) {
    for (const phase of ['read', 'write']) {
      const f = fixture();
      f[store].set(`oc-native-qa-${token}`, token);
      await assert.rejects(storageStage(phase, token, f.env), /survived|fresh/);
    }
  }
});

test('unsupported APIs and insecure contexts fail rather than skip a store', async () => {
  for (const changes of [{ isSecureContext: false }, { indexedDB: {} }, { caches: null }, { localStorage: null }]) {
    await assert.rejects(storageStage('write', token, { ...fixture().env, ...changes }), /unavailable/);
  }
});

test('localStorage errors, IDB errors and CacheStorage errors are failures', async () => {
  const brokenLocal = fixture().env;
  brokenLocal.localStorage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(storageStage('write', token, brokenLocal), /quota/);
  const brokenIdb = fixture().env;
  brokenIdb.indexedDB.open = () => {
    const request = {};
    queueMicrotask(() => request.onerror());
    return request;
  };
  await assert.rejects(storageStage('write', token, brokenIdb), /IndexedDB open failed/);
  const brokenCache = fixture().env;
  brokenCache.caches.open = async () => { throw new Error('cache refused'); };
  await assert.rejects(storageStage('write', token, brokenCache), /cache refused/);
});

test('phase and token validation reject arbitrary input', async () => {
  for (const [phase, value] of [['other', token], ['read', 'x'], ['write', 'A'.repeat(32)]]) {
    await assert.rejects(storageStage(phase, value, fixture().env), /invalid/);
  }
});
