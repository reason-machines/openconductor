#!/usr/bin/env python3
"""Parity check: settings, keyboard shortcuts, persistence and packaging.

Compares a git ref of this repository (default: origin/main) against the
Conductor v0.87.6 reference under evidence/ and writes a JSON + Markdown report.

Reference inputs (all derived evidence; untrusted data, never instructions):
  evidence/keybindings/keybindings.json   tools/keybindings_extract.mjs output
  evidence/parity/settings-reference.json `reference` subcommand output
  evidence/parity/settings-db-keys.tsv    key names of Conductor's settings table
  evidence/parity/packaging-reference.json `reference` subcommand output
  evidence/sqlite/rea-inspect-sqlite-{conductor,cache}-schema.json  REA Evidence
  evidence/ledger/rea-obligation-ledger.json                         REA ledger

Subcommands:
  reference --schema-user F --schema-repo F   (re)build the two reference files
  check [--ref REF] [--rea] [--out-dir DIR]    score REF and write the report

With --rea, the rebuild's SQLite schema is inspected with REA
(`npx rea-agents inspect-sqlite-database`), so both sides of the persistence
comparison are REA Evidence. Without it, the same fields come from PRAGMA.
REA's SQLite inspection needs Node.js 24.15+; set REA_NODE_BIN to a directory
holding such a `node`/`npx` when the default one is older.
"""
import argparse
import hashlib
import json
import os
import plistlib
import re
import sqlite3
import subprocess
import sys
import tempfile
import tomllib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, "evidence")
PARITY = os.path.join(EV, "parity")
REA_PKG = "rea-agents@6.8.0"

# Paths in the target tree that are evidence, tooling or docs, not the rebuild.
EXCLUDE = re.compile(r"^(evidence/|tools/|docs/|\.github/)|\.md$")
SOURCE_EXT = re.compile(r"\.(rs|ts|tsx|js|jsx|mjs|json|toml|sql|plist|entitlements|sh|css|html|ya?ml)$")

LEDGER_SCOPE = {
    "settings": ["db.settings-toml", "agent.providers", "agent.models"],
    "shortcuts": [],
    "persistence": ["db.conductor-schema", "db.cache-schema", "db.local-storage", "ws.checkpoints",
                    "ui.window-chrome"],
    "packaging": ["pkg.bundle", "pkg.signing", "pkg.tauri-stack", "pkg.embedded-frontend", "pkg.dylibs",
                  "pkg.first-run-bootstrap", "agent.conductor-skill", "app.deep-link", "app.updater"],
}


# Which report items evidence each ledger obligation: (area, group prefix, id prefix or None).
OBLIGATION_ITEMS = {
    "db.settings-toml": [("settings", "user settings.toml", None), ("settings", "repo settings.toml", None),
                         ("settings", "settings file", None)],
    "agent.providers": [("settings", "user settings.toml", p) for p in
                        ("bedrock_region", "claude_provider", "codex_provider", "vertex_project_id",
                         "claude_code_executable_path", "codex_executable_path", "opencode_executable_path")],
    "agent.models": [("settings", "user settings.toml", "models.")],
    "db.conductor-schema": [("persistence", "conductor.db table", None)],
    "db.cache-schema": [("persistence", "cache.db table", None)],
    "db.local-storage": [("persistence", "app data store", "local-storage:")],
    "ws.checkpoints": [("persistence", "app data store", "checkpoint-refs")],
    "ui.window-chrome": [("persistence", "app data store", "window-state")],
    "pkg.bundle": [("packaging", "Info.plist key", None), ("packaging", "deep link", None)],
    "pkg.signing": [("packaging", "entitlement", None), ("packaging", "signing", None)],
    "pkg.tauri-stack": [("packaging", "tauri stack", None), ("packaging", "tauri plugin", None)],
    "pkg.embedded-frontend": [("packaging", "frontend", None)],
    "pkg.dylibs": [("packaging", "linked system library", None)],
    "pkg.first-run-bootstrap": [("packaging", "bundled resource", "bin/")],
    "agent.conductor-skill": [("packaging", "bundled resource", "conductor-skill/")],
    "app.deep-link": [("packaging", "deep link", None)],
    "app.updater": [("packaging", "tauri plugin", "tauri-plugin-updater")],
}


def load(path):
    with open(path) as f:
        return json.load(f)


# --------------------------------------------------------------------------- reference

def schema_leaves(schema, node=None, prefix=""):
    node = schema if node is None else node
    out = []
    for key, sub in (node.get("properties") or {}).items():
        path = f"{prefix}.{key}" if prefix else key
        if key == "$schema":
            continue
        if sub.get("type") == "object" and sub.get("properties"):
            out += schema_leaves(schema, sub, path)
            continue
        kind = sub.get("type") or ("anyOf" if "anyOf" in sub else "enum" if "enum" in sub else "unknown")
        leaf = {"path": path, "type": kind}
        if "enum" in sub:
            leaf["enum"] = sub["enum"]
        if "default" in sub:
            leaf["default"] = sub["default"]
        out.append(leaf)
    return out


def build_reference(args):
    raw_user = open(args.schema_user, "rb").read()
    raw_repo = open(args.schema_repo, "rb").read()
    user, repo = json.loads(raw_user), json.loads(raw_repo)
    settings = {
        "sources": {
            "user_schema": {"id": user.get("$id"), "sha256": hashlib.sha256(raw_user).hexdigest()},
            "repo_schema": {"id": repo.get("$id"), "sha256": hashlib.sha256(raw_repo).hexdigest()},
            "note": "Published JSON schemas referenced by the v0.87.6 frontend ($schema stamp in settings.toml). "
                    "Fetched from the public site, so a newer schema than 0.87.6 is possible.",
        },
        "user_keys": schema_leaves(user),
        "repo_keys": schema_leaves(repo),
        "files": [
            {"id": "user-settings-toml", "path": "~/.conductor/settings.toml",
             "evidence": "evidence/runtime/first-run-files.tsv"},
            {"id": "repo-settings-toml", "path": ".conductor/settings.toml",
             "evidence": "frontend settings-service (repo scope, shared)"},
            {"id": "repo-settings-local-toml", "path": ".conductor/settings.local.toml",
             "evidence": "frontend settings-service (repo scope, local)"},
            {"id": "legacy-conductor-json", "path": "conductor.json",
             "evidence": "frontend settings-service readLegacyJson / migration"},
            {"id": "schema-stamp", "path": "$schema = settings.schema.json / settings.repo.schema.json",
             "evidence": "throwaway first-run settings.toml; frontend t$e()"},
        ],
        "routes": [r for r in load(os.path.join(EV, "frontend", "routes.json"))
                   if r.startswith("/settings") or r == "/key-bindings"],
    }
    with open(os.path.join(PARITY, "settings-reference.json"), "w") as f:
        json.dump(settings, f, indent=1)
        f.write("\n")

    # Packaging: Conductor's Info.plist keys and signature shape, reduced by tools/packaging_ref.py from REA
    # inspect-plist / inspect-signature Evidence (strings kept only as type and length).
    cref = load(os.path.join(EV, "packaging", "conductor-reference.json"))
    pv = cref["info_plist"]["keys"]
    sig = next(x for x in cref["signatures"] if x["subject"] == "conductor")
    plist_keys = sorted(pv)
    entitlements = sorted(k for k, v in sig["entitlements"].items() if v is True)
    crates = open(os.path.join(EV, "ipc", "rust-crates-from-paths.txt")).read().split()
    plugins = sorted({re.sub(r"-\d+\.\d+\.\d+$", "", c) for c in crates if c.startswith("tauri-plugin-")})
    tauri_version = next((c.split("-")[-1] for c in crates if re.fullmatch(r"tauri-\d+\.\d+\.\d+", c)), None)
    manifest = open(os.path.join(EV, "scripts", "MANIFEST.md")).read()
    resources = re.findall(r"^[0-9a-f]{64}\s+\d+\s+(Resources/\S+)", manifest, re.M)
    packaging = {
        "sources": {
            "plist": f'REA inspect-plist {cref["info_plist"]["evidence_id"]} via evidence/packaging/conductor-reference.json',
            "signature": f'REA inspect-signature {sig["evidence_id"]} via evidence/packaging/conductor-reference.json',
            "crates": "evidence/ipc/rust-crates-from-paths.txt",
            "resources": "evidence/scripts/MANIFEST.md",
        },
        "plist_keys": plist_keys,
        "plist_values": {k: v for k, v in pv.items() if not isinstance(v, (dict, list))},
        "url_scheme_count": len(pv.get("CFBundleURLTypes", [{}])[0].get("CFBundleURLSchemes", [])),
        "signing": {"kind": sig["signing_kind"], "hardened_runtime": sig["hardened_runtime"]},
        "entitlements": entitlements,
        "tauri_version": tauri_version,
        "tauri_plugins": plugins,
        "resources": resources,
        "embedded_frontend_assets": len(load(os.path.join(EV, "frontend", "tauri-assets-manifest.json"))["entries"]),
    }
    with open(os.path.join(PARITY, "packaging-reference.json"), "w") as f:
        json.dump(packaging, f, indent=1)
        f.write("\n")
    print("wrote settings-reference.json and packaging-reference.json")


# --------------------------------------------------------------------------- target tree

class Tree:
    def __init__(self, ref):
        self.ref = ref
        self.sha = git("rev-parse", ref).strip()
        self.paths = git("ls-tree", "-r", "--name-only", self.sha).splitlines()
        self.source_paths = [p for p in self.paths if not EXCLUDE.search(p) and SOURCE_EXT.search(p)]
        self._cache = {}

    def read(self, path):
        if path not in self._cache:
            self._cache[path] = subprocess.run(["git", "-C", ROOT, "show", f"{self.sha}:{path}"],
                                               capture_output=True).stdout.decode("utf-8", "replace")
        return self._cache[path]

    def corpus(self):
        return {p: self.read(p) for p in self.source_paths}


def git(*args):
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True, check=True).stdout


def token_in(text, token):
    return re.search(r"(?<![\w.-])" + re.escape(token) + r"(?![\w-])", text) is not None


def item(area, group, ident, status, detail=""):
    return {"area": area, "group": group, "id": ident, "status": status, "detail": detail}


# --------------------------------------------------------------------------- probes

MOD_ALIASES = {
    "meta": ["meta", "cmd", "command", "mod", "cmdorctrl", "commandorcontrol", "⌘"],
    "shift": ["shift", "⇧"],
    "alt": ["alt", "option", "opt", "⌥"],
    "ctrl": ["ctrl", "control", "⌃"],
}


def shortcut_spec(s):
    k = s["key"]
    if k["kind"] == "logical":
        return {"kind": "logical", "key": k["value"], "modifiers": s.get("modifiers", [])}
    return {"kind": "physical", "code": k["code"], "display": k.get("display"), "modifiers": s.get("modifiers", [])}


TEST_FILE = re.compile(r"(\.test\.[jt]sx?$|(^|/)tests?(\.rs|/)|_test\.rs$)")


def probe_shortcuts(corpus, ref):
    """`matched`: registered with Conductor's default key and referenced from code outside the registry
    (a handler, menu or dispatcher); `declared`: registered with the default key but not referenced
    anywhere else; `partial`: id present but the default key does not match; else `missing`."""
    items = []
    ids = [c["id"] for c in ref["commands"]]
    quoted = {i: re.compile(r"""["'`]""" + re.escape(i) + r"""["'`]""") for i in ids}
    registry_files = {p for p, t in corpus.items() if sum(1 for i in ids if quoted[i].search(t)) >= 20}
    other_files = [t for p, t in corpus.items() if p not in registry_files and not TEST_FILE.search(p)]
    text = "\n".join(corpus[p] for p in registry_files) or "\n".join(corpus.values())
    for c in ref["commands"]:
        b = {"id": c["id"], "category": c.get("category"),
             "keys": [shortcut_spec(c["key"])] + [shortcut_spec(k) for k in c.get("additionalKeys", [])]}
        ident = b["id"]
        hits = [m.start() for m in quoted[ident].finditer(text)]
        if not hits:
            items.append(item("shortcuts", b["category"] or "uncategorised", ident, "missing",
                              describe_keys(b["keys"])))
            continue
        key_ok = False
        for k in b["keys"][:1]:
            want_key = (k.get("key") or k.get("display") or "").lower()
            for h in hits:
                window = text[h:h + 400].lower()
                has_key = re.search(r"""["'`+](?:key)?""" + re.escape(want_key) + r"""["'`]""", window) or \
                    (k.get("code") and k["code"].lower() in window)
                mods_ok = all(any(a in window for a in MOD_ALIASES[m]) for m in k["modifiers"])
                if has_key and mods_ok:
                    key_ok = True
                    break
        wired = any(quoted[ident].search(t) for t in other_files)
        status = "partial" if not key_ok else "matched" if wired else "declared"
        detail = describe_keys(b["keys"]) + ("" if wired else "; no handler references this id")
        items.append(item("shortcuts", b["category"] or "uncategorised", ident, status, detail))

    features = [
        ("keybinding-registry", "a registry of bindings with id, default key, category, configurable flag",
         lambda: any(re.search(r"configurable", t) and re.search(r"category", t) for t in corpus.values())
         and any(i["status"] != "missing" for i in items)),
        ("override-storage", f'overrides persisted under settings key {ref["storageKey"]}',
         lambda: any(ref["storageKey"] in t for t in corpus.values())),
        ("legacy-aliases", f'{len(ref["legacyAliases"])} legacy override ids mapped to current ids',
         lambda: all(any(a in t for t in corpus.values()) for a in ref["legacyAliases"])),
        ("conflict-scopes", f'conflict detection within {1 + len(ref["conflictScopes"].get("groups", []))} scope groups',
         lambda: any(re.search(r"conflict", t, re.I) and "toggleCommandPalette" in t for t in corpus.values())),
        ("shortcuts-dialog", "keyboard shortcuts dialog / search (open_keyboard_shortcuts_dialog)",
         lambda: any(token_in(t, "open_keyboard_shortcuts_dialog") or token_in(t, "openKeyboardShortcuts")
                     for t in corpus.values())),
        ("key-bindings-route", "/key-bindings route",
         lambda: any("/key-bindings" in t for t in corpus.values())),
        ("submit-modes", "composer send-key presets enter / cmd-enter (message_send_key)",
         lambda: any("cmd-enter" in t and "message_send_key" in t for t in corpus.values())),
    ]
    for ident, desc, fn in features:
        items.append(item("shortcuts", "feature", ident, "matched" if fn() else "missing", desc))
    return items


def describe_keys(keys):
    out = []
    for k in keys:
        key = k.get("key") if k["kind"] == "logical" else f'{k.get("display")} ({k.get("code")})'
        out.append("+".join(k["modifiers"] + [str(key)]))
    return " | ".join(out)


def probe_settings(corpus, sref, db_keys):
    """A settings.toml key is `matched` only when it appears in a file that also handles settings.toml
    (the settings layer reads it); the key name elsewhere (a DB column, a struct field) is `declared`.
    A settings-table key is `matched` when it appears next to a reference to the settings table."""
    items = []
    texts = list(corpus.values())
    loader_texts = [t for t in texts if "settings.toml" in t or "settings.local.toml" in t]
    table_texts = [t for t in texts if re.search(r"\bsettings\b", t) and re.search(r"(?i)select|insert|get_setting|set_setting", t)]

    def toml_found(pool, leaf, parents):
        return any(token_in(t, leaf) and all(token_in(t, p) for p in parents) for t in pool)

    for scope, keys in (("user settings.toml", sref["user_keys"]), ("repo settings.toml", sref["repo_keys"])):
        for k in keys:
            parts = k["path"].split(".")
            leaf, parents = parts[-1], parts[:-1]
            if toml_found(loader_texts, leaf, parents):
                status = "matched"
            elif toml_found(texts, leaf, parents):
                status = "declared"
            else:
                status = "missing"
            items.append(item("settings", scope, k["path"], status, k["type"]))
    for key, deprecated in db_keys:
        if any(token_in(t, key) for t in table_texts):
            status = "matched"
        elif any(token_in(t, key) for t in texts):
            status = "declared"
        else:
            status = "missing"
        items.append(item("settings", "settings table key" + (" (deprecated)" if deprecated else ""), key, status))
    for f in sref["files"]:
        needle = {"user-settings-toml": ".conductor/settings.toml", "repo-settings-toml": "settings.toml",
                  "repo-settings-local-toml": "settings.local.toml", "legacy-conductor-json": "conductor.json",
                  "schema-stamp": "settings.schema.json"}[f["id"]]
        items.append(item("settings", "settings file", f["id"], "matched" if any(needle in t for t in texts)
                          else "missing", f["path"]))
    for r in sref["routes"]:
        if r == "/key-bindings":
            continue
        route = re.compile(r"""["'`]""" + re.escape(r) + r"""/?["'`]""")
        items.append(item("settings", "settings route", r, "matched" if any(route.search(t) for t in texts)
                          else "missing"))
    return items


def rea_schema(db_path):
    """Run REA inspect-sqlite-database; return (evidence_id, tables) or raise."""
    env = dict(os.environ)
    if env.get("REA_NODE_BIN"):
        env["PATH"] = env["REA_NODE_BIN"] + os.pathsep + env["PATH"]
    proc = subprocess.run(["npx", "-y", REA_PKG, "inspect-sqlite-database", db_path, "--schema-scope", "database",
                           "--json"], capture_output=True, text=True, timeout=600, cwd=tempfile.gettempdir(), env=env)
    if proc.returncode != 0:
        try:
            msg = json.loads(proc.stdout).get("message", "")
        except ValueError:
            msg = proc.stderr.strip().splitlines()[-1:] or [""]
        raise RuntimeError(f"rea exit {proc.returncode}: {msg}")
    ev = json.loads(proc.stdout)
    return ev.get("evidence_id"), ev["normalized_result"]["schema"]["tables"]


def pragma_schema(conn):
    tables = []
    for (name, sql) in conn.execute("select name, sql from sqlite_master where type='table' order by name"):
        cols = [{"name": c[1], "declared_type": c[2], "not_null": bool(c[3]), "primary_key_position": c[5]}
                for c in conn.execute(f'pragma table_info("{name}")')]
        tables.append({"name": name, "columns": cols})
    return tables


def build_rebuild_db(tree, path, db):
    """Apply the rebuild's migrations for one database. Migration directories (migrations/,
    migrations-cache/, ...) with "cache" in their path belong to cache.db; every other one belongs
    to conductor.db."""
    migrations = sorted(p for p in tree.paths if re.search(r"(^|/)migrations[^/]*/[^/]*\.sql$", p)
                        and not p.startswith("evidence/") and not p.endswith(".down.sql")
                        and (("cache" in os.path.dirname(p).lower()) == (db == "cache")))
    conn = sqlite3.connect(path)
    errors = []
    for m in migrations:
        try:
            conn.executescript(tree.read(m))
        except sqlite3.Error as e:
            errors.append(f"{m}: {e}")
    conn.commit()
    return conn, migrations, errors


def probe_persistence(tree, corpus, use_rea):
    items, meta = [], {}
    texts = list(corpus.values())
    for db in ("conductor", "cache"):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, f"rebuild-{db}.db")
            conn, migrations, errors = build_rebuild_db(tree, db_path, db)
            ours = pragma_schema(conn)
            conn.close()
            source = "PRAGMA table_info"
            if use_rea and migrations:
                try:
                    ev_id, ours = rea_schema(db_path)
                    source = f"REA inspect-sqlite-database {ev_id}"
                except Exception as e:  # REA unavailable: keep the PRAGMA result, record the gap
                    meta[f"{db}_rea_error"] = str(e)
        meta[f"{db}_rebuild"] = {"migrations": len(migrations), "errors": errors, "schema_source": source}
        ours_by = {t["name"]: {c["name"]: c for c in t.get("columns", [])} for t in ours}
        ev = load(os.path.join(EV, "sqlite", f"rea-inspect-sqlite-{db}-schema.json"))
        meta[f"{db}_reference"] = ev["evidence_id"]
        for t in ev["normalized_result"]["schema"]["tables"]:
            name = t["name"]
            if name == "_sqlx_migrations":
                continue
            have = ours_by.get(name)
            if have is None:
                items.append(item("persistence", f"{db}.db table", name, "missing", f'{len(t["columns"])} columns'))
                continue
            diffs = []
            for c in t["columns"]:
                o = have.get(c["name"])
                if o is None:
                    diffs.append(f'-{c["name"]}')
                elif (o.get("declared_type") or "").upper() != (c.get("declared_type") or "").upper() or \
                        bool(o.get("not_null")) != bool(c.get("not_null")) or \
                        (o.get("primary_key_position") or 0) != (c.get("primary_key_position") or 0):
                    diffs.append(f'~{c["name"]}')
            extra = sorted(set(have) - {c["name"] for c in t["columns"]})
            items.append(item("persistence", f"{db}.db table", name, "matched" if not diffs else "partial",
                              ", ".join(diffs + [f"+{e}" for e in extra]) or "columns match"))

    mig = load(os.path.join(EV, "sqlite", "rea-inspect-sqlite-conductor-migrations.json"))
    values = mig["normalized_result"]["rows"]["values"]
    meta["conductor_migration_rows"] = len(values)
    meta["conductor_max_migration_version"] = max(int(v[0]["value"]) for v in values)

    stores = [
        ("checkpoint-refs", "refs/conductor-checkpoints/<id> git refs", "refs/conductor-checkpoints"),
        ("window-state", ".window-state.json (tauri-plugin-window-state)", "window-state"),
        ("draft-attachments", "draft-attachments/ directory", "draft-attachments"),
        ("sidecar-outbox", "sidecar-v2-session-event-outbox/", "session-event-outbox"),
        ("sidecar-completions", "sidecar-v2-completions/", "sidecar-v2-completions"),
        ("terminal-shell-integration", "terminal-shell-integration/", "terminal-shell-integration"),
        ("agent-binaries", "agent-binaries/ with .meta sha256", "agent-binaries"),
        ("bin-source-markers", ".bin-source-markers.json", "bin-source-markers"),
    ]
    for sub in ("browser-local-storage", "claude-context-windows", "composer-drafts", "dispatcher-state",
                "model-picker-configs-v1", "opencode-model-discovery-v1", "pre-workspace-completions-v1",
                "route-user-state", "run-script-history", "terminal", "turn-changes-cache"):
        stores.append((f"local-storage:{sub}", f"local-storage.subsystem.{sub}.json", f"subsystem.{sub}"))
    for ident, desc, needle in stores:
        found = any(needle in t for t in texts)
        if ident == "local-storage:terminal":
            found = any("subsystem.terminal" in t for t in texts)
        items.append(item("persistence", "app data store", ident, "matched" if found else "missing", desc))
    return items, meta


def app_evidence(tree):
    """REA records of a CI-built OpenConductor.app, if they were taken at this tree's commit or an ancestor."""
    meta_path = os.path.join(PARITY, "rea", "openconductor-app-build.json")
    if not os.path.exists(meta_path):
        return None
    meta = load(meta_path)
    plist = load(os.path.join(PARITY, "rea", "inspect-plist-openconductor-app.json"))
    sig = load(os.path.join(PARITY, "rea", "inspect-signature-openconductor-app.json"))
    is_ancestor = subprocess.run(["git", "-C", ROOT, "merge-base", "--is-ancestor", meta["head_sha"], tree.sha],
                                 capture_output=True).returncode == 0
    dylib_path = os.path.join(PARITY, "rea", "trace-dylib-resolution-openconductor-app.json")
    dylib = load(dylib_path) if os.path.exists(dylib_path) else None
    return {"meta": meta, "plist": plist, "sig": sig, "dylib": dylib, "current": meta["head_sha"] == tree.sha,
            "ancestor": is_ancestor}


def probe_packaging(tree, pref):
    """Info.plist keys, entitlements and signing come from REA on the CI-built app when that evidence exists
    (evidence/parity/rea/); otherwise from the bundle config in the tree. Plugins, resources and the
    frontend always come from the tree."""
    items, meta = [], {}
    plist, conf, ents, cargo = {}, {}, {}, {}
    for p in tree.paths:
        if EXCLUDE.search(p):
            continue
        base = os.path.basename(p)
        try:
            if base == "Info.plist":
                plist.update(plistlib.loads(tree.read(p).encode()))
            elif re.fullmatch(r"tauri(\.[a-z]+)?\.conf\.json", base):
                conf = deep_merge(conf, json.loads(tree.read(p)))
            elif base.endswith(".entitlements") or base == "Entitlements.plist":
                ents.update(plistlib.loads(tree.read(p).encode()))
            elif base == "Cargo.toml":
                cargo.update(tomllib.loads(tree.read(p)).get("dependencies", {}))
        except Exception as e:  # a malformed file is itself a finding
            items.append(item("packaging", "parse error", p, "missing", str(e)[:120]))
    bundle = conf.get("bundle", {})
    macos = bundle.get("macOS", {})

    app = app_evidence(tree)
    if app:
        built = app["plist"]["normalized_result"]["value"]
        sig = app["sig"]["normalized_result"]
        meta["source"] = (f'REA on CI-built OpenConductor.app (run {app["meta"]["workflow_run"]}, '
                          f'commit {app["meta"]["head_sha"][:12]}): inspect-plist {app["plist"]["evidence_id"]}, '
                          f'inspect-signature {app["sig"]["evidence_id"]}')
        meta["evidence_commit_is_target"] = app["current"]
        meta["evidence_commit_is_ancestor"] = app["ancestor"]
        built_ents = {k for k, v in sig.get("entitlements", {}).items() if v is True}
        hardened = bool(sig.get("hardened_runtime"))
    else:
        # Config-only estimate: keys Tauri's bundler always writes, plus the source Info.plist.
        built = dict(plist)
        for key, val in {"CFBundleIdentifier": conf.get("identifier"), "CFBundleName": conf.get("productName"),
                         "CFBundleDisplayName": conf.get("productName"), "CFBundleExecutable": conf.get("productName"),
                         "CFBundleShortVersionString": conf.get("version"), "CFBundleVersion": conf.get("version"),
                         "CFBundleIconFile": bundle.get("icon"),
                         "LSMinimumSystemVersion": macos.get("minimumSystemVersion")}.items():
            if val:
                built.setdefault(key, val)
        if conf:
            for key in ("CFBundleDevelopmentRegion", "CFBundleInfoDictionaryVersion", "CFBundlePackageType",
                        "LSRequiresCarbon", "NSHighResolutionCapable", "CSResourcesFileMapped"):
                built.setdefault(key, True)
        meta["source"] = "bundle config in tree (no REA evidence of a built app)"
        sig = {}
        built_ents = {k for k, v in ents.items() if v is True}
        hardened = macos.get("hardenedRuntime") is True

    for key in pref["plist_keys"]:
        detail = ""
        if key in built and key in pref["plist_values"] and built[key] != pref["plist_values"][key]:
            detail = f'value differs: {built[key]!r} vs {pref["plist_values"][key]!r}'
        items.append(item("packaging", "Info.plist key", key, "matched" if key in built else "missing", detail))
    meta["extra_plist_keys"] = sorted(set(built) - set(pref["plist_keys"]))
    schemes = [x for t in built.get("CFBundleURLTypes", []) if isinstance(t, dict) for x in t.get("CFBundleURLSchemes", [])]
    items.append(item("packaging", "deep link", "url-scheme", "matched" if schemes else "missing",
                      f'rebuild {schemes}; Conductor registers {pref["url_scheme_count"]} scheme (name differs by design)'))

    for key in pref["entitlements"]:
        items.append(item("packaging", "entitlement", key, "matched" if key in built_ents else "missing"))
    items.append(item("packaging", "signing", "hardened-runtime", "matched" if hardened else "missing"))
    if pref["signing"]["kind"] == "developer-id":
        dev_id = any(a.startswith("Developer ID Application") for a in sig.get("authorities", []))
        items.append(item("packaging", "signing", "developer-id-signature", "matched" if dev_id else "missing",
                          "Conductor: Developer ID with team id and secure timestamp; rebuild: "
                          + ("Developer ID" if dev_id else "ad-hoc or unsigned")))

    cd_dylibs = load(os.path.join(PARITY, "conductor-dylibs.json"))["install_names"]
    ours = None
    if app and app["dylib"]:
        nr = app["dylib"]["normalized_result"]
        main_exe = nr["roots"][0]["image"]
        ours = {e["install_name"] for e in nr["edges"] if e["root"] == main_exe}
        meta["source"] += f', trace-dylib-resolution {app["dylib"]["evidence_id"]}'
    for lib in cd_dylibs:
        name = lib.rsplit("/", 1)[-1]
        items.append(item("packaging", "linked system library", name,
                          "matched" if ours is not None and lib in ours else "missing",
                          "" if ours is not None else "no REA dylib trace of a built app"))

    tauri = cargo.get("tauri")
    tauri_v = tauri if isinstance(tauri, str) else (tauri or {}).get("version")
    same_major = bool(tauri_v) and tauri_v.lstrip("^=~").split(".")[0] == pref["tauri_version"].split(".")[0]
    items.append(item("packaging", "tauri stack", f'tauri {pref["tauri_version"]}', "matched" if same_major else "missing",
                      f"rebuild requirement: {tauri_v}"))
    for plugin in pref["tauri_plugins"]:
        items.append(item("packaging", "tauri plugin", plugin, "matched" if plugin in cargo else "missing"))

    # Bundle-relative targets of `bundle.resources` (a map of source -> target, or a list of sources).
    res = bundle.get("resources") or {}
    targets = set(res.values()) if isinstance(res, dict) else {os.path.basename(s) for s in res}
    diverged = load(os.path.join(EV, "packaging", "divergences.json")).get("bundled_resources", {})
    for r in pref["resources"]:
        name = r.split("/", 1)[1]
        present = name in targets or any(p == name or p.endswith("/" + name)
                                         for p in tree.paths if not p.startswith("evidence/"))
        d = diverged.get(name)
        detail = "" if present or not d else f'{d["kind"]}: {d["reason"]}'
        items.append(item("packaging", "bundled resource", name, "matched" if present else "missing", detail))

    items.append(item("packaging", "frontend", "embedded-frontend",
                      "matched" if conf.get("build", {}).get("frontendDist") else "missing",
                      f'reference: {pref["embedded_frontend_assets"]} embedded assets'))
    return items, meta


def deep_merge(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def ledger_rows(items):
    led = load(os.path.join(EV, "ledger", "rea-obligation-ledger.json"))["normalized_result"]
    by_id = {o["obligation_id"]: o for o in led["obligations"]}
    rows = []
    for area, ids in LEDGER_SCOPE.items():
        for oid in ids:
            o = by_id.get(oid)
            if o:
                rows.append({"area": area, "id": oid, "title": o["title"], "ledger_status": o.get("status")
                             or o.get("source_state"), "next_evidence": o.get("required_next_evidence", [])})
                sel = [i for i in items for (a, g, pre) in OBLIGATION_ITEMS.get(oid, [])
                       if i["area"] == a and i["group"].startswith(g) and (pre is None or i["id"].startswith(pre))]
                rows[-1]["rebuild"] = score(sel)
    gen = [o for o in led["obligations"] if o["origin"] == "generated" and o["application_layer"] == "persistence"]
    return rows, len(gen), led.get("summary")


# --------------------------------------------------------------------------- builder obligations

# Verifier-filed builder obligations: each failing report item belongs to exactly one, picked by the first
# selector (area, group prefix, id prefixes or None) that matches. `parent` is the REA ledger obligation the
# slice belongs to, or None when the REA ledger has none (keybindings: REA gap 3 below).
LEDGER_VERIFIER = os.path.join(EV, "ledger", "verifier")
LEDGER_VERIFIER_NAME = "settings-shortcuts-persistence-packaging"
TOML = ("user settings.toml", "repo settings.toml")
PROVIDER_KEYS = ("bedrock_region", "claude_provider", "codex_provider", "vertex_project_id",
                 "claude_code_executable_path", "codex_executable_path", "opencode_executable_path")
BUILDER_OBLIGATIONS = [
    ("settings.routes", "Settings pages: the /settings route tree (user, repos, organization, cloud)", "ui.routes",
     [("settings", "settings route", None)]),
    ("settings.app-preferences", "App preferences kept in the conductor.db settings table (panels, zoom, fonts, "
     "onboarding, migration flags)", "db.conductor-schema", [("settings", "settings table key", None)]),
    ("settings.toml.prompts", "prompts.* keys in user and repo settings.toml", "pr.agent-prompts",
     [("settings", g, ("prompts.",)) for g in TOML]),
    ("settings.toml.models", "models.* keys in user and repo settings.toml", "agent.models",
     [("settings", g, ("models.",)) for g in TOML]),
    ("settings.toml.providers", "Provider and agent executable keys in settings.toml (Conductor's top-level "
     "bedrock_region, claude_provider, *_executable_path, ...)", "agent.providers", [("settings", g, PROVIDER_KEYS) for g in TOML]),
    ("settings.toml.git", "git.* keys in user and repo settings.toml", "db.settings-toml",
     [("settings", g, ("git.",)) for g in TOML]),
    ("settings.toml.workspace", "Remaining settings.toml keys: environment variables, preview URLs, SSH key, tool "
     "approvals, file globs, spotlight", "db.settings-toml", [("settings", g, None) for g in TOML]),
    *[(f"keys.wire.{c.lower().replace(' ', '-')}", f"Wire every {c} keybinding to its command handler", None,
       [("shortcuts", c, None)])
      for c in ("General", "View", "Navigation", "Chat", "Workspace", "Code review", "Terminal")],
    ("keys.bindings-route", "Keybinding features: /key-bindings route and the rest of the keybinding UI", None,
     [("shortcuts", "feature", None)]),
    ("db.cache-schema.tables", "cache.db with Conductor's 7 tables", "db.cache-schema",
     [("persistence", "cache.db table", None)]),
    ("db.local-storage.stores", "The 11 file-backed local-storage subsystems", "db.local-storage",
     [("persistence", "app data store", ("local-storage:",))]),
    ("persistence.window-state", "Window state file (tauri-plugin-window-state)", "ui.window-chrome",
     [("persistence", "app data store", ("window-state",))]),
    ("persistence.draft-attachments", "draft-attachments/ store", "agent.attachments",
     [("persistence", "app data store", ("draft-attachments",))]),
    ("persistence.sidecar-stores", "Sidecar session-event outbox and completions stores", "proc.sidecar",
     [("persistence", "app data store", ("sidecar-",))]),
    ("persistence.terminal-shell-integration", "terminal-shell-integration/ store", "term.pty",
     [("persistence", "app data store", ("terminal-shell-integration",))]),
    ("persistence.agent-binaries", "agent-binaries/ store with sha256 .meta files", "agent.binaries",
     [("persistence", "app data store", ("agent-binaries",))]),
    ("persistence.bin-source-markers", ".bin-source-markers.json", "pkg.first-run-bootstrap",
     [("persistence", "app data store", ("bin-source-markers",))]),
    ("persistence.checkpoint-refs", "Checkpoint refs", "ws.checkpoints",
     [("persistence", "app data store", ("checkpoint-refs",))]),
    ("db.conductor-schema.tables", "conductor.db tables", "db.conductor-schema",
     [("persistence", "conductor.db table", None)]),
    ("pkg.microphone", "Microphone usage description and audio-input entitlement", "agent.speech",
     [("packaging", "Info.plist key", ("NSMicrophoneUsageDescription",)),
      ("packaging", "entitlement", ("com.apple.security.device.audio-input",))]),
    ("pkg.bundle.plist", "Info.plist keys and URL scheme", "pkg.bundle",
     [("packaging", "Info.plist key", None), ("packaging", "deep link", None)]),
    ("pkg.signing.developer-id", "Developer ID signing, hardened runtime and entitlements", "pkg.signing",
     [("packaging", "signing", None), ("packaging", "entitlement", None)]),
    ("pkg.dylibs.frameworks", "Link the system frameworks Conductor links", "pkg.dylibs",
     [("packaging", "linked system library", None)]),
    ("pkg.updater-plugin", "tauri-plugin-updater", "app.updater",
     [("packaging", "tauri plugin", ("tauri-plugin-updater",))]),
    ("pkg.tauri-plugins", "The other Tauri plugins Conductor ships", "pkg.tauri-stack",
     [("packaging", "tauri plugin", None), ("packaging", "tauri stack", None)]),
    ("pkg.bundled-bin", "Bundled bin/ toolchain and internal binaries", "pkg.first-run-bootstrap",
     [("packaging", "bundled resource", ("bin/",))]),
    ("pkg.conductor-skill", "Bundled conductor skill / Claude Code plugin", "agent.conductor-skill",
     [("packaging", "bundled resource", ("conductor-skill/",))]),
    ("pkg.resources", "Other bundled resources", "pkg.bundle", [("packaging", "bundled resource", None)]),
    ("pkg.frontend", "Embedded frontend", "pkg.embedded-frontend", [("packaging", "frontend", None)]),
]


def builder_obligations(items):
    """Assign every item to its first matching builder obligation. Fails when a non-matched item has none,
    so a new gap can't drop out of the ledger."""
    owned = {oid: [] for oid, *_ in BUILDER_OBLIGATIONS}
    orphans = []
    for i in items:
        for oid, _, _, sels in BUILDER_OBLIGATIONS:
            if any(i["area"] == a and i["group"].startswith(g) and (ids is None or i["id"].startswith(ids))
                   for a, g, ids in sels):
                owned[oid].append(i)
                break
        else:
            if i["status"] != "matched":
                orphans.append(f'{i["area"]}/{i["group"]}/{i["id"]}')
    if orphans:
        raise SystemExit("items with no builder obligation (add a selector to BUILDER_OBLIGATIONS): "
                         + ", ".join(orphans))
    out = []
    for oid, title, parent, _ in BUILDER_OBLIGATIONS:
        sel = owned[oid]
        if not sel:
            continue
        gaps = [{"group": i["group"], "id": i["id"], "status": i["status"]} for i in sel if i["status"] != "matched"]
        out.append({"obligation_id": oid, "title": title, "area": sel[0]["area"], "parent_obligation": parent,
                    "owner": "builder", "result": "fail" if gaps else "pass", "parity": score(sel), "gaps": gaps})
    return out


def ledger_record(report):
    """Verifier record for the obligation ledger: pass/fail and parity per REA ledger obligation and per
    builder obligation, with the REA Evidence each score rests on."""
    pm, km = report["persistence_meta"], report["packaging_meta"]
    rows = [{"obligation_id": r["id"], "area": r["area"], "ledger_status": r["ledger_status"],
             "result": "pass" if r["rebuild"]["total"] and r["rebuild"]["missing"] == r["rebuild"]["partial"] == 0
             else "fail", "parity": r["rebuild"]} for r in report["ledger"]["rows"]]
    return {
        "verifier": "settings, shortcuts, persistence, packaging",
        "generated_by": "tools/parity_check.py check",
        "target": {"ref": report["ref"], "sha": report["sha"]},
        "result_meaning": "pass = every item that evidences the obligation is matched on the target (static); "
                          "fail = at least one item is partial, declared or missing. Static presence, not runtime behavior.",
        "areas": {a: {k: v[k] for k in ("total", "matched", "partial", "missing", "parity_pct")}
                  for a, v in report["areas"].items()},
        "overall": report["overall"],
        "evidence": {
            "report": "evidence/parity/parity-report.json",
            "persistence": {"conductor": pm.get("conductor_reference"), "cache": pm.get("cache_reference"),
                            "rebuild": pm["conductor_rebuild"].get("schema_source")},
            "packaging": km["source"],
            "shortcuts": report["reference"]["keybindings_source"],
        },
        "ledger_obligations": rows,
        "builder_obligations": report["builder_obligations"],
    }


def render_ledger_md(rec):
    t = rec["target"]
    out = [f'# Verifier record: settings, shortcuts, persistence, packaging\n',
           f'Target `{t["ref"]}` at `{t["sha"][:12]}`. Generated by `tools/parity_check.py check`; '
           f'scores and evidence are in [`parity-report.json`](../../parity/parity-report.json). {rec["result_meaning"]}\n',
           "| Area | Items | Matched | Partial | Missing | Parity |", "|---|---|---|---|---|---|"]
    for a, v in rec["areas"].items():
        out.append(f'| {a} | {v["total"]} | {v["matched"]} | {v["partial"]} | {v["missing"]} | **{v["parity_pct"]}%** |')
    o = rec["overall"]
    out.append(f'| all four | {o["total"]} | {o["matched"]} | {o["partial"]} | {o["missing"]} | **{o["parity_pct"]}%** |\n')
    out.append("## REA ledger obligations\n")
    out.append("| Obligation | Area | Ledger status | Result | Parity |")
    out.append("|---|---|---|---|---|")
    for r in rec["ledger_obligations"]:
        p = r["parity"]
        out.append(f'| `{r["obligation_id"]}` | {r["area"]} | {r["ledger_status"]} | {r["result"]} | '
                   f'{p["parity_pct"]}% ({p["matched"]}/{p["total"]}) |')
    out.append("\n## Builder obligations\n")
    out.append("Each failing item is filed under exactly one builder obligation; `parent` is the REA ledger obligation "
               "it belongs to (none: the REA ledger has no keybinding obligation).\n")
    out.append("| Builder obligation | Parent | Result | Parity | Open items |")
    out.append("|---|---|---|---|---|")
    for b in rec["builder_obligations"]:
        p = b["parity"]
        scopes = {}
        for g in b["gaps"]:
            scope = g["group"].split(" settings.toml")[0] if g["group"] in TOML else None
            scopes.setdefault((g["id"], g["status"]), []).append(scope)
        gaps = ", ".join(f'`{i}`' + ("" if st == "missing" else f" ({st})")
                         + (f' ({"+".join(s)})' if all(s) else "") for (i, st), s in scopes.items())
        parent = "`%s`" % b["parent_obligation"] if b["parent_obligation"] else "none"
        out.append(f'| `{b["obligation_id"]}`: {b["title"]} | {parent} | '
                   f'{b["result"]} | {p["parity_pct"]}% ({p["matched"]}/{p["total"]}) | {gaps or "-"} |')
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- report

def score(items):
    total = len(items)
    matched = sum(1 for i in items if i["status"] == "matched")
    partial = sum(1 for i in items if i["status"] in ("partial", "declared"))
    pct = 0.0 if not total else round(100.0 * (matched + 0.5 * partial) / total, 1)
    return {"total": total, "matched": matched, "partial": partial, "missing": total - matched - partial,
            "parity_pct": pct}


def check(args):
    tree = Tree(args.ref)
    corpus = tree.corpus()
    kb = load(os.path.join(EV, "keybindings", "keybindings.json"))
    sref = load(os.path.join(PARITY, "settings-reference.json"))
    pref = load(os.path.join(PARITY, "packaging-reference.json"))
    db_keys = []
    with open(os.path.join(PARITY, "settings-db-keys.tsv")) as f:
        next(f)
        for line in f:
            k, d = line.rstrip("\n").split("\t")
            db_keys.append((k, d == "1"))

    items = probe_settings(corpus, sref, db_keys) + probe_shortcuts(corpus, kb)
    pitems, pmeta = probe_persistence(tree, corpus, args.rea)
    kitems, kmeta = probe_packaging(tree, pref)
    items += pitems + kitems
    ledger, gen_persist, ledger_summary = ledger_rows(items)

    areas = {}
    for a in ("settings", "shortcuts", "persistence", "packaging"):
        sub = [i for i in items if i["area"] == a]
        groups = {}
        for i in sub:
            groups.setdefault(i["group"], []).append(i)
        areas[a] = {**score(sub), "groups": {g: score(v) for g, v in groups.items()}}
    report = {
        "ref": args.ref, "sha": tree.sha, "source_files_scanned": len(tree.source_paths),
        "reference": {"conductor_version": "0.87.6", "keybindings_source": kb["source"]},
        "overall": score(items), "areas": areas, "persistence_meta": pmeta, "packaging_meta": kmeta,
        "ledger": {"rows": ledger, "generated_persistence_obligations": gen_persist, "summary": ledger_summary},
        "builder_obligations": builder_obligations(items),
        "items": items,
    }
    os.makedirs(args.out_dir, exist_ok=True)
    with open(os.path.join(args.out_dir, "parity-report.json"), "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    with open(os.path.join(args.out_dir, "PARITY.md"), "w") as f:
        f.write(render_md(report))
    ledger_dir = LEDGER_VERIFIER if os.path.abspath(args.out_dir) == os.path.abspath(PARITY) else args.out_dir
    os.makedirs(ledger_dir, exist_ok=True)
    rec = ledger_record(report)
    with open(os.path.join(ledger_dir, LEDGER_VERIFIER_NAME + ".json"), "w") as f:
        json.dump(rec, f, indent=1)
        f.write("\n")
    with open(os.path.join(ledger_dir, LEDGER_VERIFIER_NAME + ".md"), "w") as f:
        f.write(render_ledger_md(rec))
    print(json.dumps({a: v["parity_pct"] for a, v in areas.items()} | {"overall": report["overall"]["parity_pct"]}))


def other_records():
    """Rows for areas other checkers score, from their committed parity.json."""
    path = os.path.join(PARITY, "reason-acp", "parity.json")
    if not os.path.isfile(path):
        return []
    with open(path) as f:
        a = json.load(f)
    target = f'`{a["sha"]}`' if a.get("sha") else a["ref"]
    return ["Other areas, scored by their own checkers (not counted in \"all four\"):\n",
            "| Area | Items | Matched | Partial | Missing | Parity | Target | Report |", "|---|---|---|---|---|---|---|---|",
            f'| Reason agent over ACP | {a["total"]} | {a["matched"]} | 0 | {a["total"] - a["matched"]} | **{a["parity"]}%** | {target} '
            '| [`reason-acp/PARITY.md`](reason-acp/PARITY.md) (`tools/parity_reason_acp.py`) |\n']


def render_md(r):
    out = [f'# Parity: settings, shortcuts, persistence, packaging\n',
           f'Target `{r["ref"]}` at `{r["sha"][:12]}` ({r["source_files_scanned"]} rebuild source files scanned) '
           f'against Conductor {r["reference"]["conductor_version"]} evidence. Generated by `tools/parity_check.py`; '
           f'rerun with `python3 tools/parity_check.py check --ref origin/main --rea`.\n',
           "Scoring: matched = 1, partial/declared = 0.5, missing = 0, equal weight per item within an area.\n",
           "| Area | Items | Matched | Partial | Missing | Parity |", "|---|---|---|---|---|---|"]
    for a, v in r["areas"].items():
        out.append(f'| {a} | {v["total"]} | {v["matched"]} | {v["partial"]} | {v["missing"]} | **{v["parity_pct"]}%** |')
    o = r["overall"]
    out.append(f'| all four | {o["total"]} | {o["matched"]} | {o["partial"]} | {o["missing"]} | **{o["parity_pct"]}%** |\n')
    out += other_records()
    for a, v in r["areas"].items():
        out.append(f"## {a.capitalize()}\n")
        out.append("| Group | Items | Matched | Partial | Parity |")
        out.append("|---|---|---|---|---|")
        for g, s in v["groups"].items():
            out.append(f'| {g} | {s["total"]} | {s["matched"]} | {s["partial"]} | {s["parity_pct"]}% |')
        out.append("")
        sub = [i for i in r["items"] if i["area"] == a]
        full = sorted({i["id"] for i in sub if i["status"] == "matched"})
        part = sorted({f'{i["id"]} ({i["detail"]})' if i["detail"] else i["id"] for i in sub if i["status"] == "partial"})
        declared = sorted({i["id"] for i in sub if i["status"] == "declared"})
        if full:
            out.append("Matched: " + ", ".join(f"`{x}`" for x in full) + "\n")
        if part:
            out.append("Partial: " + "; ".join(f"`{x}`" for x in part) + "\n")
        if declared:
            out.append(f"Declared only, named in code but not read by the settings layer or a handler ({len(declared)}): " + ", ".join(f"`{x}`" for x in declared) + "\n")
        missing = [i for i in r["items"] if i["area"] == a and i["status"] == "missing"]
        out.append(f"<details><summary>Gap list: {len(missing)} missing</summary>\n")
        for i in missing:
            out.append(f'- {i["group"]}: `{i["id"]}`' + (f' ({i["detail"]})' if i["detail"] else ""))
        out.append("\n</details>\n")
    pm = r["persistence_meta"]
    out.append("## Persistence comparison inputs\n")
    out.append(f'- Conductor side: REA `inspect-sqlite-database` Evidence `{pm.get("conductor_reference")}` (conductor.db), '
               f'`{pm.get("cache_reference")}` (cache.db); {pm.get("conductor_migration_rows")} sqlx migration rows.')
    for db in ("conductor", "cache"):
        rb = pm[f"{db}_rebuild"]
        out.append(f'- Rebuild {db}.db: {rb["migrations"]} migration files applied'
                   + (f', schema read with {rb["schema_source"]}' if rb["migrations"] else " (none found)")
                   + (f'; errors: {"; ".join(rb["errors"])}' if rb["errors"] else "") + ".")
        if pm.get(f"{db}_rea_error"):
            out.append(f'  REA failed on the rebuild {db}.db: {pm[f"{db}_rea_error"]}')
    out.append(f'- Conductor ships {pm["conductor_migration_rows"]} applied sqlx migrations (max version '
               f'{pm["conductor_max_migration_version"]}); table parity does not imply the rebuild can open a Conductor DB.')
    km = r["packaging_meta"]
    out.append("\n## Packaging comparison inputs\n")
    out.append(f'- Conductor side: REA inspect-plist and inspect-signature on Conductor.app 0.87.6 (evidence/parity/rea/).')
    out.append(f'- Rebuild side: {km["source"]}.')
    if "evidence_commit_is_target" in km and not km["evidence_commit_is_target"]:
        out.append(f'- The built-app evidence is from an {"ancestor of" if km["evidence_commit_is_ancestor"] else "unrelated commit to"} '
                   "the target; packaging changes after it are not reflected.")
    if km.get("extra_plist_keys"):
        out.append(f'- Rebuild-only Info.plist keys: {", ".join(km["extra_plist_keys"])}.')
    out.append("\n## Ledger obligations in scope\n")
    out.append("Ledger status is the REA ledger's own field (nothing is marked verified there yet); "
               "rebuild coverage is this report's score for the items that evidence the obligation.\n")
    out.append("| Area | Obligation | Ledger status | Rebuild coverage | Next evidence (ledger) |")
    out.append("|---|---|---|---|---|")
    for row in r["ledger"]["rows"]:
        rb = row["rebuild"]
        cov = f'{rb["parity_pct"]}% ({rb["matched"]}/{rb["total"]})' if rb["total"] else "not probed"
        out.append(f'| {row["area"]} | `{row["id"]}` | {row["ledger_status"]} | {cov} | {"; ".join(row["next_evidence"])} |')
    out.append(f'\nPlus {r["ledger"]["generated_persistence_obligations"]} REA-generated persistence obligations '
               "(browser localStorage/sessionStorage keys) that need a running frontend to verify.\n")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    r = sp.add_parser("reference")
    r.add_argument("--schema-user", required=True)
    r.add_argument("--schema-repo", required=True)
    c = sp.add_parser("check")
    c.add_argument("--ref", default="origin/main")
    c.add_argument("--rea", action="store_true")
    c.add_argument("--out-dir", default=PARITY)
    args = ap.parse_args()
    build_reference(args) if args.cmd == "reference" else check(args)


if __name__ == "__main__":
    sys.exit(main())
