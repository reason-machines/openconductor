// Browser stand-in for Tauri 2's IPC (window.__TAURI_INTERNALS__) used to render
// Conductor's frontend outside the app. Synthetic data only: no real tokens, and
// every network call made through plugin:http fails or returns a fixture
// (HTTP_FIXTURES).
//
// Inputs (set by earlier scripts): window.__OC_SCENARIO__, window.__OC_SEED__,
// window.__OC_FIXTURES__. Debug output: window.__OC_IPC_LOG__ (every call),
// window.__OC_UNHANDLED__ (commands that fell through to null).
// Harness hooks: window.__OC_EMIT__(event, payload), window.__OC_DB__.
(function () {
  "use strict";
  const scenarioName = window.__OC_SCENARIO__ || "signed-in";
  const fixtures = (window.__OC_FIXTURES__ && window.__OC_FIXTURES__(scenarioName)) || {};
  const seed = (window.__OC_SEED__ && window.__OC_SEED__(scenarioName)) || {};
  const log = (window.__OC_IPC_LOG__ = []);
  const unhandled = (window.__OC_UNHANDLED__ = {});
  // ?oc_theme=light|dark picks Conductor's theme mode (seed.js writes it into
  // the virtual filesystem where Conductor's portable storage reads it).
  const themeMode = new URLSearchParams(location.search).get("oc_theme") || "dark";


  // ---- callbacks and events -------------------------------------------------
  const callbacks = new Map();
  let nextCallbackId = 1;
  function transformCallback(cb, once) {
    const id = nextCallbackId++;
    callbacks.set(id, { cb, once: !!once });
    return id;
  }
  function unregisterCallback(id) {
    callbacks.delete(id);
  }
  function runCallback(id, data) {
    const entry = callbacks.get(id);
    if (!entry) return;
    if (entry.once) callbacks.delete(id);
    try {
      entry.cb && entry.cb(data);
    } catch (e) {
      console.error("[oc-mock] callback error", e);
    }
  }
  const listeners = new Map(); // eventId -> {event, handler}
  let nextEventId = 1;
  let sidecarRequestsSent = false;
  function emit(event, payload) {
    for (const [id, l] of listeners) {
      if (l.event === event) runCallback(l.handler, { event, id, payload });
    }
  }

  // ---- sqlite (sql.js) ------------------------------------------------------
  const dbs = {};
  const ready = (async () => {
    const SQL = await window.initSqlJs({ locateFile: () => "/__mock/sql-wasm.wasm" });
    const [conductorSchema, cacheSchema] = await Promise.all([
      fetch("/__mock/conductor.schema.sql").then((r) => r.text()),
      fetch("/__mock/cache.schema.sql").then((r) => r.text()),
    ]);
    dbs.conductor = new SQL.Database();
    dbs.conductor.exec(conductorSchema);
    dbs.cache = new SQL.Database();
    dbs.cache.exec(cacheSchema);
    if (seed.conductor) dbs.conductor.exec(seed.conductor);
    if (seed.cache) dbs.cache.exec(seed.cache);
    window.__OC_DB__ = dbs;
  })();

  function pickDb(name) {
    return name && String(name).includes("cache") ? dbs.cache : dbs.conductor;
  }
  function bindValue(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "object") return JSON.stringify(v);
    return v;
  }
  function prep(query) {
    // tauri-plugin-sql accepts $1-style positional params; sql.js wants ?1.
    return String(query).replace(/\$(\d+)/g, "?$1");
  }
  function sqlSelect(args) {
    const db = pickDb(args.db);
    const stmt = db.prepare(prep(args.query));
    try {
      stmt.bind((args.values || []).map(bindValue));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }
  function sqlExecute(args) {
    const db = pickDb(args.db);
    db.run(prep(args.query), (args.values || []).map(bindValue));
    const changes = db.getRowsModified();
    const last = db.exec("SELECT last_insert_rowid()")[0];
    return [changes, last ? last.values[0][0] : 0];
  }

  // ---- plugin:store (in memory) ----------------------------------------------
  const stores = new Map();
  let nextRid = 1000;
  function storeFor(rid) {
    if (!stores.has(rid)) stores.set(rid, new Map());
    return stores.get(rid);
  }

  // ---- plugin:fs (virtual, persisted in localStorage for one browser run) ---
  // Seeded per scenario from seed.vfs ({absolutePath: text}).
  const VFS_KEY = "__oc_vfs";
  const vfs = (() => {
    try {
      const saved = localStorage.getItem(VFS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { ...(seed.vfs || {}) };
  })();
  const saveVfs = () => {
    try {
      localStorage.setItem(VFS_KEY, JSON.stringify(vfs));
    } catch (e) {}
  };
  // ?oc_setup_script=<command>: tide-web's repository-local settings (.conductor/settings.local.toml in its
  // main checkout) set scripts.setup, for the terminal panel's Setup tab (tools/side-by-side/setup-tab.mjs).
  // ?oc_run_script=<command> sets scripts.run the same way, for the Run tab (one run script, "run").
  const setupScript = new URLSearchParams(location.search).get("oc_setup_script");
  const runScript = new URLSearchParams(location.search).get("oc_run_script");
  if (setupScript || runScript)
    vfs["/Users/demo/code/tide-web/.main/.conductor/settings.local.toml"] =
      "[scripts]\n" + (setupScript ? `setup = ${JSON.stringify(setupScript)}\n` : "") + (runScript ? `run = ${JSON.stringify(runScript)}\n` : "");
  saveVfs();
  window.__OC_VFS__ = vfs;
  const failSettingsWrite = new URLSearchParams(location.search).has("oc_fail_settings_write");
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  function fsPath(args, options) {
    if (args && typeof args === "object" && !(args instanceof Uint8Array) && !Array.isArray(args) && args.path) return String(args.path);
    const h = options && options.headers;
    const p = h && (typeof h.get === "function" ? h.get("path") : h.path);
    return p ? decodeURIComponent(p) : "";
  }
  function handleFs(cmd, args, options) {
    const op = cmd.slice("plugin:fs|".length);
    const p = fsPath(args, options);
    switch (op) {
      case "exists":
        return p in vfs || Object.keys(vfs).some((k) => k.startsWith(p.replace(/\/$/, "") + "/"));
      case "read_text_file":
      case "read_file":
        if (!(p in vfs)) throw `No such file or directory (os error 2): ${p}`;
        return Array.from(enc.encode(vfs[p]));
      case "write_text_file":
      case "write_file": {
        // ?oc_fail_settings_write=1: a repository's .conductor settings file cannot be written (a
        // read-only checkout), for Settings › Scripts' "Failed to save run script" toasts.
        if (failSettingsWrite && /\/\.conductor\/settings(\.local)?\.toml$/.test(p)) throw `Permission denied (os error 13): ${p}`;
        const bytes = args instanceof Uint8Array ? args : Array.isArray(args) ? Uint8Array.from(args) : args.data ? Uint8Array.from(args.data) : new Uint8Array();
        vfs[p] = dec.decode(bytes);
        saveVfs();
        return null;
      }
      case "mkdir":
        return null;
      case "remove":
        for (const k of Object.keys(vfs)) if (k === p || k.startsWith(p + "/")) delete vfs[k];
        saveVfs();
        return null;
      case "rename":
      case "copy_file": {
        const from = String(args.oldPath ?? args.fromPath), to = String(args.newPath ?? args.toPath);
        if (!(from in vfs)) throw `No such file or directory (os error 2): ${from}`;
        vfs[to] = vfs[from];
        if (op === "rename") delete vfs[from];
        saveVfs();
        return null;
      }
      case "read_dir": {
        const prefix = p.replace(/\/$/, "") + "/";
        const names = new Map();
        for (const k of Object.keys(vfs)) {
          if (!k.startsWith(prefix)) continue;
          const rest = k.slice(prefix.length).split("/");
          names.set(rest[0], rest.length > 1);
        }
        return [...names].map(([name, isDirectory]) => ({ name, isDirectory, isFile: !isDirectory, isSymlink: false }));
      }
      case "stat":
      case "lstat":
        if (!(p in vfs)) throw `No such file or directory (os error 2): ${p}`;
        return { isFile: true, isDirectory: false, isSymlink: false, size: vfs[p].length, mtime: Date.now(), atime: Date.now(), birthtime: Date.now(), readonly: false };
    }
    return undefined;
  }

  // ---- paths -----------------------------------------------------------------
  const HOME = "/Users/demo";
  // Tauri 2 BaseDirectory enum order (Audio = 1 ... Template = 23).
  const APP = HOME + "/Library/Application Support/com.conductor.app";
  const BASE_DIRS = {
    1: HOME + "/Music", 2: HOME + "/Library/Caches", 3: HOME + "/Library/Application Support",
    4: HOME + "/Library/Application Support", 5: HOME + "/Library/Application Support", 6: HOME + "/Documents",
    7: HOME + "/Downloads", 8: HOME + "/Pictures", 9: HOME + "/Public", 10: HOME + "/Movies",
    11: "/Applications/Conductor.app/Contents/Resources", 12: "/private/tmp", 13: APP, 14: APP, 15: APP,
    16: HOME + "/Library/Caches/com.conductor.app", 17: HOME + "/Library/Logs/com.conductor.app",
    18: HOME + "/Desktop", 19: "/Applications/Conductor.app/Contents/MacOS", 20: HOME + "/Library/Fonts",
    21: HOME, 22: "/private/tmp", 23: HOME + "/Templates",
  };
  const joinPaths = (parts) => parts.filter(Boolean).join("/").replace(/\/+/g, "/");

  // ---- defaults for commands with a known shape ------------------------------
  const DEFAULTS = {
    "plugin:app|version": "0.87.6",
    "plugin:app|name": "Conductor",
    "plugin:app|tauri_version": "2.11.1",
    "plugin:app|identifier": "com.conductor.app",
    "plugin:os|locale": "en-US",
    "plugin:os|hostname": "demo-mac",
    "plugin:window|is_fullscreen": false,
    "plugin:window|is_maximized": false,
    "plugin:window|is_focused": true,
    "plugin:window|is_visible": true,
    "plugin:window|theme": themeMode,
    "plugin:window|scale_factor": 2,
    "plugin:window|inner_size": { width: 1440, height: 900 },
    "plugin:window|outer_size": { width: 1440, height: 900 },
    "plugin:window|inner_position": { x: 0, y: 0 },
    "plugin:window|outer_position": { x: 0, y: 0 },
    "plugin:deep-link|get_current": null,
    "plugin:updater|check": null,
    "plugin:notification|is_permission_granted": true,
    "plugin:notification|request_permission": "granted",
    get_db_uri: null,
    is_cef_runtime: false,
    get_keychain_setting: null,
    list_port_forwards: [],
    get_binary_verification_errors: [],
    get_resource_usage: null,
    find_available_local_port: 41000,
    check_sidecar_http_health: true,
    get_sidecar_log_path: HOME + "/Library/Logs/com.conductor.app/sidecar.log",
    get_or_create_local_storage_encryption_key: "c3ludGhldGljLWhhcm5lc3Mta2V5LW5vdC1yZWFs",
  };

  // The only network answers the harness gives, keyed "METHOD url". Without
  // an organization list Conductor's repository settings routes see
  // organizationsError and redirect to /settings/user/general (fHi in
  // renderApp); an empty list is a signed-in user with no organizations, so
  // those routes render as they do for a local-only account.
  // Roundhouse calls first trade the API token for an access token
  // (/auth/exchange, schema {accessToken, accessTokenExpiresAt, refreshToken}).
  const HTTP_FIXTURES = {
    "POST https://api.conductor.build/auth/exchange": {
      accessToken: "oc-harness-fake-access-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      refreshToken: "oc-harness-fake-refresh-token",
    },
    "GET https://api.conductor.build/organizations": { organizations: [] },
  };
  const httpResponses = new Map();
  let nextHttpRid = 1;

  async function handle(cmd, args, options) {
    if (cmd.startsWith("plugin:sql|")) {
      await ready;
      if (cmd === "plugin:sql|load") return args.db;
      if (cmd === "plugin:sql|select") return sqlSelect(args);
      if (cmd === "plugin:sql|execute") return sqlExecute(args);
      if (cmd === "plugin:sql|close") return true;
    }
    if (cmd.startsWith("plugin:fs|")) {
      const r = handleFs(cmd, args, options);
      if (r !== undefined) return r;
    }
    if (cmd in fixtures) {
      const f = fixtures[cmd];
      return typeof f === "function" ? f(args, { emit, dbs }) : f;
    }
    switch (cmd) {
      case "rpc_to_sidecar": {
        // JSON-RPC to the Bun sidecar. Requests (with an id) get a reply on the
        // rpc_from_sidecar event, payload {line}; result from fixtures.sidecar.
        let msg;
        try {
          msg = JSON.parse(args.line);
        } catch (e) {
          return null;
        }
        if (msg && msg.id !== undefined && msg.method) {
          const handler = (fixtures.sidecar || {})[msg.method];
          let reply;
          try {
            const result = typeof handler === "function" ? handler(msg.params, { emit, dbs }) : handler;
            reply = { jsonrpc: "2.0", id: msg.id, result: result === undefined ? null : result };
          } catch (e) {
            reply = { jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: String(e) } };
          }
          if (handler === undefined) unhandled["sidecar:" + msg.method] = (unhandled["sidecar:" + msg.method] || 0) + 1;
          setTimeout(() => emit("rpc_from_sidecar", { line: JSON.stringify(reply) }), 5);
        }
        return null;
      }
      case "plugin:event|listen": {
        const id = nextEventId++;
        listeners.set(id, { event: args.event, handler: args.handler });
        // Requests the sidecar sends the app unprompted (seed.sidecarRequests,
        // e.g. a toolApproval), once the app listens for sidecar lines.
        if (args.event === "rpc_from_sidecar" && seed.sidecarRequests && seed.sidecarRequests.length && !sidecarRequestsSent) {
          sidecarRequestsSent = true;
          setTimeout(() => {
            for (const req of seed.sidecarRequests) emit("rpc_from_sidecar", { line: JSON.stringify(req) });
          }, 500);
        }
        return id;
      }
      case "plugin:event|unlisten":
        listeners.delete(args.eventId);
        return null;
      case "plugin:event|emit":
      case "plugin:event|emit_to":
        emit(args.event, args.payload);
        return null;
      case "plugin:store|load":
      case "plugin:store|get_store": {
        const rid = nextRid++;
        storeFor(rid);
        return rid;
      }
      case "plugin:store|get": {
        const s = storeFor(args.rid);
        return [s.get(args.key) ?? null, s.has(args.key)];
      }
      case "plugin:store|set":
        storeFor(args.rid).set(args.key, args.value);
        return null;
      case "plugin:store|has":
        return storeFor(args.rid).has(args.key);
      case "plugin:store|delete":
        return storeFor(args.rid).delete(args.key);
      case "plugin:store|keys":
        return [...storeFor(args.rid).keys()];
      case "plugin:store|values":
        return [...storeFor(args.rid).values()];
      case "plugin:store|entries":
        return [...storeFor(args.rid).entries()];
      case "plugin:store|length":
        return storeFor(args.rid).size;
      case "plugin:path|resolve_directory":
        return joinPaths([BASE_DIRS[args.directory] ?? HOME, args.path]);
      case "plugin:path|join":
        return joinPaths(args.paths || []);
      case "plugin:path|resolve":
        return joinPaths(args.paths || []);
      case "plugin:path|normalize":
        return args.path;
      case "plugin:path|basename":
        return String(args.path).split("/").filter(Boolean).pop() ?? "";
      case "plugin:path|dirname":
        return String(args.path).split("/").slice(0, -1).join("/") || "/";
      case "plugin:path|extname":
        return (String(args.path).match(/\.([^./]+)$/) || [])[1] ?? "";
      case "plugin:path|is_absolute":
        return String(args.path).startsWith("/");
      case "plugin:http|fetch": {
        const { method, url } = args.clientConfig || {};
        const body = HTTP_FIXTURES[`${method} ${url}`];
        if (body === undefined) {
          console.warn(`[oc-mock] refused plugin:http ${method} ${url}`);
          throw "network disabled in the screenshot harness";
        }
        const rid = nextHttpRid++;
        httpResponses.set(rid, { url, bytes: Array.from(new TextEncoder().encode(JSON.stringify(body))) });
        return rid;
      }
      case "plugin:http|fetch_send": {
        const r = httpResponses.get(args.rid);
        if (r === undefined) throw "unknown http request";
        return { status: 200, statusText: "OK", url: r.url, headers: [["content-type", "application/json"]], rid: args.rid };
      }
      case "plugin:http|fetch_read_body": {
        // Conductor's plugin-http client reads the body from a Channel: each
        // message is the chunk plus one trailing byte, 1 meaning end of body.
        const r = httpResponses.get(args.rid);
        httpResponses.delete(args.rid);
        const id = args.streamChannel && args.streamChannel.id;
        if (r !== undefined && id !== undefined) {
          runCallback(id, { message: [...r.bytes, 0], index: 0 });
          runCallback(id, { message: [1], index: 1 });
        }
        return null;
      }
      case "plugin:http|fetch_cancel":
        httpResponses.delete(args.rid);
        return null;
      case "list_file_tree":
        // The right panel's All files tab: { name, path, is_directory } under
        // directoryPath, at most maxDepth levels deep (null: all).
        return listFileTree(args.directoryPath, args.maxDepth);
    }
    if (cmd in DEFAULTS) return DEFAULTS[cmd];
    unhandled[cmd] = (unhandled[cmd] || 0) + 1;
    return null;
  }

  // Worktree files every seeded workspace shows in the All files tab (invented).
  const TREE_FILES = [".gitignore", "README.md", "package.json", "tsconfig.json", "src/main.ts", "src/lib/auth.ts", "src/lib/auth.test.ts", "src/lib/session.ts", "src/routes/login.tsx", "src/routes/dashboard.tsx", "public/favicon.svg"];
  let treeRoot = null; // the first directory asked for is the worktree
  function listFileTree(dir, maxDepth) {
    const abs = String(dir || "").replace(/\/+$/, "");
    treeRoot ??= abs;
    const sub = abs === treeRoot ? "" : abs.slice(treeRoot.length + 1);
    const seen = new Map();
    for (const full of TREE_FILES) {
      if (sub && !full.startsWith(sub + "/")) continue;
      const parts = (sub ? full.slice(sub.length + 1) : full).split("/");
      for (let i = 1; i <= parts.length; i++) {
        if (maxDepth != null && i > maxDepth) break;
        const rel = parts.slice(0, i).join("/");
        if (!seen.has(rel)) seen.set(rel, { name: parts[i - 1], path: `${abs}/${rel}`, is_directory: i < parts.length });
      }
    }
    return [...seen.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  async function invoke(cmd, args = {}, options) {
    const entry = { cmd, args, t: Math.round(performance.now()) };
    log.push(entry);
    try {
      const result = await handle(cmd, args || {}, options);
      entry.ok = true;
      if (Array.isArray(result)) entry.rows = result.length;
      return result;
    } catch (e) {
      entry.error = String(e && e.message ? e.message : e);
      throw e;
    }
  }

  // Look like macOS WebKit (the app reads navigator for data-platform).
  try {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
    Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });
    // Conductor sets <html data-platform> from navigator.userAgent when window.__TAURI__ is absent
    // (renderApp `Hde`), and its macOS-only startup checks (`QQt`, the Xcode license) read that.
    // Headless Chromium on Linux says "linux"; a capture that needs the macOS path opts in with
    // ?oc_xcode_license= so every other reference state keeps the user agent it was captured with.
    if (new URLSearchParams(location.search).has("oc_xcode_license"))
      Object.defineProperty(Navigator.prototype, "userAgent", { get: () => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)" });
  } catch (e) {}
  // Belt and braces next to the CSP: refuse any cross-origin fetch quickly.
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const u = new URL(typeof input === "string" ? input : input.url || String(input), location.href);
    if (u.origin !== location.origin) return Promise.reject(new TypeError("blocked by screenshot harness: " + u.host));
    return realFetch(input, init);
  };
  navigator.sendBeacon = () => true;
  // Ship the IPC log to the harness server every second (same origin).
  setInterval(() => {
    try {
      realFetch("/__mock/log?scenario=" + encodeURIComponent(scenarioName), {
        method: "POST",
        body: JSON.stringify({ unhandled, vfs, shell: window.__OC_SHELL_LOG__, log: log.map((e) => ({ cmd: e.cmd, args: e.args, error: e.error, rows: e.rows })) }),
      });
    } catch (e) {}
  }, 1000);

  window.__OC_EMIT__ = emit;
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    plugins: {},
    transformCallback,
    unregisterCallback,
    runCallback,
    callbacks,
    convertFileSrc: (filePath, protocol = "asset") => `${protocol}://localhost/${encodeURIComponent(filePath)}`,
    invoke,
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (event, eventId) => listeners.delete(eventId),
  };
  window.__TAURI_OS_PLUGIN_INTERNALS__ = {
    platform: "macos",
    family: "unix",
    os_type: "macos",
    arch: "aarch64",
    version: "26.1.0",
    eol: "\n",
    exe_extension: "",
    hostname: "demo-mac",
    locale: "en-US",
  };
})();
