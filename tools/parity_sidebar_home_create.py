#!/usr/bin/env python3
"""Score OpenConductor against an evidence-referenced parity checklist.

Usage:
  parity_sidebar_home_create.py validate [--checklist F]          check every evidence ref resolves
  parity_sidebar_home_create.py pin      [--checklist F]          (re)write copy-catalog hash pins
  parity_sidebar_home_create.py score    [--checklist F] [--ref GITREF | --tree DIR] [--json OUT] [--md OUT]
  parity_sidebar_home_create.py obligations [--checklist F] [--ref GITREF | --tree DIR] [--json OUT] [--md OUT]
                                          builder obligations for every item whose verdict is not implemented

Conductor strings are referenced by copy-catalog index only; pins hold a sha256
prefix per index so a regenerated catalog fails validation instead of silently
pointing at different text. Nothing from the catalog is printed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EV = ROOT / "evidence"
DEFAULT_CHECKLIST = EV / "parity" / "sidebar-home-create" / "sidebar-home-create.checklist.json"
SOURCE_DIRS = ("src/", "src-tauri/src/", "src-tauri/migrations/", "migrations/", "crates/")
# src/keybindings/ is binding machinery (registry of Conductor command ids, override
# storage, dispatch); naming a command there is not a feature. Handlers that act on a
# binding live elsewhere (e.g. src/palette/PaletteHost.tsx) and do count.
EXCLUDE_DIRS = ("src/keybindings/",)
SOURCE_EXT = (".ts", ".tsx", ".js", ".jsx", ".rs", ".sql", ".css")
TEST_PATH = re.compile(r"(^|/)(tests?|__tests__)(/|\.rs$)|\.(test|spec)\.[jt]sx?$|_tests?\.rs$")
VERDICT_WEIGHT = {"implemented": 1.0, "partial": 0.5, "backend": 0.25, "missing": 0.0}


def skipped(path: str) -> bool:
    return bool(TEST_PATH.search(path)) or path.startswith(EXCLUDE_DIRS) or "/target/" in path
WEIGHT = {"implemented": 1.0, "partial": 0.5, "missing": 0.0}


def verdicts_path(checklist: Path) -> Path:
    return checklist.with_name(checklist.name.replace(".checklist.json", ".verdicts.json"))


def pins_path(checklist: Path) -> Path:
    return checklist.with_name(checklist.name.replace(".checklist.json", ".copy-pins.json"))


def load(checklist: Path) -> dict:
    return json.loads(checklist.read_text())


def schema_columns() -> dict[str, set[str]]:
    sql = (EV / "sqlite" / "conductor.schema.sql").read_text()
    out: dict[str, set[str]] = {}
    for m in re.finditer(r"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?\s*\((.*?)\);", sql, re.S):
        cols = set()
        for part in re.split(r",(?![^()]*\))", m.group(2)):
            w = part.strip().split()
            if w and w[0].upper() not in {"PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"}:
                cols.add(w[0].strip('"'))
        out[m.group(1)] = cols
    return out


def digest(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()[:12]


def validate(checklist: Path) -> list[str]:
    data = load(checklist)
    catalog = json.loads((EV / "frontend" / "copy-catalog.json").read_text())
    routes = set(json.loads((EV / "frontend" / "routes.json").read_text()))
    ipc = set(json.loads((EV / "ipc" / "frontend-invoke-candidates.json").read_text()))
    ledger = {o["obligation_id"] for o in json.loads((EV / "ledger" / "reviewed-obligations.json").read_text())}
    cols = schema_columns()
    pins = json.loads(pins_path(checklist).read_text()) if pins_path(checklist).exists() else {}
    errors: list[str] = []
    seen: set[str] = set()
    for it in data["items"]:
        iid = it["id"]
        if iid in seen:
            errors.append(f"{iid}: duplicate id")
        seen.add(iid)
        if it["area"] not in {"sidebar", "home", "create"}:
            errors.append(f"{iid}: unknown area {it['area']}")
        for p in it["detect"]:
            try:
                re.compile(p)
            except re.error as e:
                errors.append(f"{iid}: bad detector {p!r}: {e}")
        ev = it["evidence"]
        if not ev:
            errors.append(f"{iid}: no evidence")
        for i in ev.get("copy", []):
            if not 0 <= i < len(catalog):
                errors.append(f"{iid}: copy index {i} out of range")
            elif pins.get(str(i)) not in (None, digest(catalog[i])):
                errors.append(f"{iid}: copy index {i} no longer matches its pin (catalog regenerated?)")
            elif str(i) not in pins:
                errors.append(f"{iid}: copy index {i} not pinned (run pin)")
        for r in ev.get("routes", []):
            if r not in routes:
                errors.append(f"{iid}: route {r} not in routes.json")
        for k in ev.get("ipc", []):
            if k not in ipc:
                errors.append(f"{iid}: ipc {k} not in frontend-invoke-candidates.json")
        for o in ev.get("ledger", []):
            if o not in ledger:
                errors.append(f"{iid}: ledger obligation {o} not found")
        for s in ev.get("schema", []):
            table, _, col = s.partition(".")
            if table not in cols:
                errors.append(f"{iid}: table {table} not in conductor.schema.sql")
            elif col and col not in cols[table]:
                errors.append(f"{iid}: column {s} not in conductor.schema.sql")
        for f in ev.get("files", []):
            if not (ROOT / f).exists():
                errors.append(f"{iid}: {f} missing")
    vp = verdicts_path(checklist)
    if vp.exists():
        v = json.loads(vp.read_text())["items"]
        for iid in seen - set(v):
            errors.append(f"{iid}: no verdict")
        for iid, vi in v.items():
            if iid not in seen:
                errors.append(f"{iid}: verdict for unknown item")
            if vi["verdict"] not in VERDICT_WEIGHT:
                errors.append(f"{iid}: bad verdict {vi['verdict']}")
    return errors


def pin(checklist: Path) -> int:
    data = load(checklist)
    catalog = json.loads((EV / "frontend" / "copy-catalog.json").read_text())
    idx = sorted({i for it in data["items"] for i in it["evidence"].get("copy", [])})
    pins = {str(i): digest(catalog[i]) for i in idx}
    pins_path(checklist).write_text(json.dumps(pins, indent=1, sort_keys=True) + "\n")
    return len(pins)


def source_files(ref: str | None, tree: Path | None) -> dict[str, str]:
    files: dict[str, str] = {}
    if ref:
        names = subprocess.run(["git", "-C", str(ROOT), "ls-tree", "-r", "--name-only", ref],
                               check=True, capture_output=True, text=True).stdout.split("\n")
        for n in names:
            if n.startswith(SOURCE_DIRS) and n.endswith(SOURCE_EXT) and not skipped(n):
                files[n] = subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:{n}"],
                                          check=True, capture_output=True, text=True, errors="replace").stdout
    else:
        base = tree or ROOT
        for d in SOURCE_DIRS:
            for p in (base / d).rglob("*") if (base / d).is_dir() else []:
                rel = str(p.relative_to(base))
                if p.is_file() and p.suffix in SOURCE_EXT and "node_modules" not in p.parts and not skipped(rel):
                    files[rel] = p.read_text(errors="replace")
    return files


def score(checklist: Path, ref: str | None, tree: Path | None) -> dict:
    data = load(checklist)
    files = source_files(ref, tree)
    blob = "\n".join(files.values())
    items = []
    for it in data["items"]:
        hits = []
        for p in it["detect"]:
            m = re.search(p, blob, re.I)
            where = None
            if m:
                where = next((n for n, t in files.items() if re.search(p, t, re.I)), None)
            hits.append({"pattern": p, "matched": bool(m), "file": where})
        n = sum(h["matched"] for h in hits)
        status = "implemented" if n == len(hits) else "partial" if n else "missing"
        items.append({"id": it["id"], "area": it["area"], "feature": it["feature"], "status": status, "detectors": hits})
    areas = {}
    for a in ("sidebar", "home", "create"):
        rows = [i for i in items if i["area"] == a]
        areas[a] = {
            "items": len(rows),
            "implemented": sum(i["status"] == "implemented" for i in rows),
            "partial": sum(i["status"] == "partial" for i in rows),
            "missing": sum(i["status"] == "missing" for i in rows),
            "parity_pct": round(100 * sum(WEIGHT[i["status"]] for i in rows) / len(rows), 1),
        }
    total = round(100 * sum(WEIGHT[i["status"]] for i in items) / len(items), 1)
    res = {"ref": ref or str(tree or ROOT), "source_files": len(files), "detector_parity_pct": total, "areas": areas, "items": items}
    vp = verdicts_path(checklist)
    if vp.exists():
        v = json.loads(vp.read_text())
        res["verdicts_ref"] = v["ref"]
        res["verdicts_verified_at"] = v["verified_at"]
        for i in items:
            vi = v["items"].get(i["id"])
            i["verdict"] = vi["verdict"] if vi else "unverified"
            i["why"] = vi["why"] if vi else ""
            # Detector found nothing but a human verdict credits code, or detector fully
            # matches where the verdict says missing: re-read before trusting either.
            i["recheck"] = (i["status"] == "missing" and i["verdict"] in ("implemented", "partial")) or (
                i["status"] == "implemented" and i["verdict"] == "missing")
        for a, st in areas.items():
            rows = [i for i in items if i["area"] == a]
            for k in VERDICT_WEIGHT:
                st["verdict_" + k] = sum(i["verdict"] == k for i in rows)
            st["verdict_parity_pct"] = round(100 * sum(VERDICT_WEIGHT.get(i["verdict"], 0) for i in rows) / len(rows), 1)
        res["verdict_parity_pct"] = round(100 * sum(VERDICT_WEIGHT.get(i["verdict"], 0) for i in items) / len(items), 1)
    return res


def to_md(res: dict) -> str:
    out = [f"Scored `{res['ref']}`: {res['source_files']} source files. Detector parity **{res['detector_parity_pct']}%**."]
    if "verdict_parity_pct" in res:
        out[0] += f" Verified parity **{res['verdict_parity_pct']}%** (verdicts read on `{res['verdicts_ref']}`, {res['verdicts_verified_at']})."
        out += ["", "| Area | Items | Implemented | Partial | Backend only | Missing | Verified parity | Detector parity |",
                "|---|---|---|---|---|---|---|---|"]
        for a, s in res["areas"].items():
            out.append(f"| {a} | {s['items']} | {s['verdict_implemented']} | {s['verdict_partial']} | {s['verdict_backend']} | "
                       f"{s['verdict_missing']} | {s['verdict_parity_pct']}% | {s['parity_pct']}% |")
        out += ["", "| ID | Verdict | Detector | Feature | Finding |", "|---|---|---|---|---|"]
        out += [f"| `{i['id']}` | {i['verdict']}{' (recheck)' if i['recheck'] else ''} | {i['status']} | {i['feature']} | {i['why']} |"
                for i in res["items"]]
    else:
        out += ["", "| Area | Items | Implemented | Partial | Missing | Detector parity |", "|---|---|---|---|---|---|"]
        for a, s in res["areas"].items():
            out.append(f"| {a} | {s['items']} | {s['implemented']} | {s['partial']} | {s['missing']} | {s['parity_pct']}% |")
        out += ["", "| ID | Detector | Feature |", "|---|---|---|"]
        out += [f"| `{i['id']}` | {i['status']} | {i['feature']} |" for i in res["items"]]
    return "\n".join(out) + "\n"


# Which builder owns an item. First matching prefix wins; `also` lists builders whose work
# the item depends on (for example the DB crate must be linked before pins persist).
OWNERS = [
    ("create.setup-script", "create-workspace", ["setup-and-run-scripts"]),
    ("create.autostart-run", "setup-and-run-scripts", ["create-workspace"]),
    ("create.in-section", "create-workspace", ["sidebar"]),
    ("create.", "create-workspace", []),
    ("home.persist", "persistence", ["home"]),
    ("home.colors", "home", ["theme"]),
    ("home.repo-search", "home", ["sidebar"]),
    ("home.", "home", []),
    ("sidebar.search", "sidebar", ["search-and-palette"]),
    ("sidebar.ws-numbers", "sidebar", ["keyboard-shortcuts"]),
    ("sidebar.repo-order", "sidebar", ["persistence"]),
    ("sidebar.repo-hide", "sidebar", ["persistence"]),
    ("sidebar.repo-icon", "sidebar", ["persistence"]),
    ("sidebar.ws-pinned", "sidebar", ["persistence"]),
    ("sidebar.ws-unread", "sidebar", ["persistence"]),
    ("sidebar.ws-status", "sidebar", ["pr"]),
    ("sidebar.sections", "sidebar", ["persistence"]),
    ("sidebar.colors", "sidebar", ["theme"]),
    ("sidebar.", "sidebar", []),
]
DONE_WHEN = {
    "missing": "a user can reach the feature in the app and it behaves as the cited evidence describes",
    "backend": "the existing backend logic is reached from the UI (no localStorage-only path) and behaves as the cited evidence describes",
    "partial": "the gap in `why` is closed and the feature matches the cited evidence end to end",
}


def owner(item_id: str) -> tuple[str, list[str]]:
    for prefix, own, also in OWNERS:
        if item_id.startswith(prefix):
            return own, also
    return "unassigned", []


def obligations(res: dict, checklist: Path) -> dict:
    """One builder obligation per item whose human verdict is not `implemented`."""
    items = {i["id"]: i for i in load(checklist)["items"]}
    rank = {"missing": 0, "backend": 1, "partial": 2}
    rows = []
    for r in res["items"]:
        if r["verdict"] == "implemented":
            continue
        own, also = owner(r["id"])
        ev = items[r["id"]].get("evidence", {})
        rows.append({
            "obligation_id": f"parity.{r['id']}",
            "item": r["id"],
            "area": r["area"],
            "owner": own,
            "depends_on_builders": also,
            "feature": r["feature"],
            "verdict": r["verdict"],
            "gap": r["why"],
            "done_when": DONE_WHEN.get(r["verdict"], "re-verify"),
            "ledger_obligations": ev.get("ledger", []),
            "evidence": {k: v for k, v in ev.items() if k != "ledger"},
            "status": "open",
        })
    rows.sort(key=lambda o: (o["owner"], rank.get(o["verdict"], 9), o["item"]))
    by_owner: dict[str, int] = {}
    for o in rows:
        by_owner[o["owner"]] = by_owner.get(o["owner"], 0) + 1
    return {
        "schema": "openconductor.builder-obligations.v1",
        "ref": res["ref"],
        "verdicts_verified_at": res.get("verdicts_verified_at"),
        "verdict_parity_pct": res.get("verdict_parity_pct"),
        "rule": "An obligation closes when a verifier re-reads the item on main and records verdict `implemented`. Builders do not edit verdicts.",
        "open": len(rows),
        "by_owner": dict(sorted(by_owner.items())),
        "obligations": rows,
    }


def obligations_md(ob: dict) -> str:
    out = [f"# Builder obligations: sidebar, Home and Create workspace", "",
           f"Generated by `tools/parity_sidebar_home_create.py obligations` from the verdicts read on `{ob['ref']}` "
           f"({ob['verdicts_verified_at']}). Verified parity {ob['verdict_parity_pct']}%. {ob['open']} open.", "",
           ob["rule"], "", "| Owner | Open |", "|---|---|"]
    out += [f"| {k} | {v} |" for k, v in ob["by_owner"].items()]
    cur = None
    for o in ob["obligations"]:
        if o["owner"] != cur:
            cur = o["owner"]
            out += ["", f"## {cur}", "", "| Obligation | Verdict | Feature | Gap | Also needs | Ledger |", "|---|---|---|---|---|---|"]
        out.append(f"| `{o['obligation_id']}` | {o['verdict']} | {o['feature']} | {o['gap']} | "
                   f"{', '.join(o['depends_on_builders']) or '-'} | {', '.join(o['ledger_obligations']) or '-'} |")
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["validate", "pin", "score", "obligations"])
    ap.add_argument("--checklist", type=Path, default=DEFAULT_CHECKLIST)
    ap.add_argument("--ref")
    ap.add_argument("--tree", type=Path)
    ap.add_argument("--json", type=Path)
    ap.add_argument("--md", type=Path)
    a = ap.parse_args()
    if a.cmd == "validate":
        errs = validate(a.checklist)
        for e in errs:
            print(e, file=sys.stderr)
        print(f"{len(load(a.checklist)['items'])} items, {len(errs)} errors")
        return 1 if errs else 0
    if a.cmd == "pin":
        print(f"pinned {pin(a.checklist)} copy indices")
        return 0
    res = score(a.checklist, a.ref, a.tree)
    if a.cmd == "obligations":
        if "verdict_parity_pct" not in res:
            print("no verdicts file next to the checklist", file=sys.stderr)
            return 1
        ob = obligations(res, a.checklist)
        if a.json:
            a.json.write_text(json.dumps(ob, indent=1) + "\n")
        md = obligations_md(ob)
        if a.md:
            a.md.write_text(md)
        print(md)
        return 0
    if a.json:
        a.json.write_text(json.dumps(res, indent=1) + "\n")
    md = to_md(res)
    if a.md:
        a.md.write_text(md)
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
