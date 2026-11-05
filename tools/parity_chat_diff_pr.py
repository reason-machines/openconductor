#!/usr/bin/env python3
"""Parity check for the chat, diff viewer and PR areas against REA evidence.

Reads a features file (default evidence/parity/chat-diff-pr/features.json),
confirms every evidence anchor still resolves in the REA evidence on this
checkout, probes the implementation files for each feature layer, and writes
a Markdown report plus a JSON result.

Scoring per feature: verified (listed in `verifications`) = 1.0; otherwise
the fraction of its layers whose probe matched (code present, behaviour not
verified). Area parity is the mean feature score. Strict parity counts only
verified features.

Usage: tools/parity_chat_diff_pr.py [--features PATH] [--out-dir DIR]
                                    [--rea-compare PATH] [--check-anchors]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / "evidence"

# Implementation files probed per layer. Evidence, tools and docs never count.
EXCLUDED_TOP = {"evidence", "tools", ".git", ".github", "node_modules", "target", "dist"}
CODE_SUFFIXES = {".rs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".sql", ".svelte", ".vue"}
LAYER_SUFFIXES = {
    "data": {".sql", ".rs", ".ts"},
    "backend": {".rs", ".ts", ".js", ".mjs"},
    "command": {".rs", ".ts", ".js", ".mjs"},
    "ui": {".ts", ".tsx", ".js", ".jsx", ".css", ".svelte", ".vue"},
}


def layer_of(path: Path) -> set[str]:
    rel = path.relative_to(ROOT).as_posix()
    if rel.startswith("src-tauri/"):
        return {"data", "backend", "command"}
    if rel.startswith(("sidecar/", "server/", "runtime/")):
        return {"data", "backend", "command"}
    if "migrations/" in rel or rel.endswith(".sql"):
        return {"data"}
    return {"ui"}


def implementation_files() -> list[Path]:
    out = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or p.suffix not in CODE_SUFFIXES:
            continue
        parts = p.relative_to(ROOT).parts
        if parts[0] in EXCLUDED_TOP or any(x in EXCLUDED_TOP for x in parts):
            continue
        if p.name == "tests.rs" or p.name.endswith(("_test.rs", ".test.ts", ".test.tsx")):
            continue
        out.append(p)
    return out


class Evidence:
    def __init__(self) -> None:
        ledger = json.loads((EVIDENCE / "ledger/rea-obligation-ledger.json").read_text())
        self.ledger = {o["obligation_id"]: o for o in ledger["normalized_result"]["obligations"]}
        self.ledger_id = ledger["normalized_result"]["ledger_id"]
        self.schema = (EVIDENCE / "sqlite/conductor.schema.sql").read_text()
        self.ipc = (EVIDENCE / "ipc/frontend-invoke-candidates.json").read_text()
        catalog = json.loads((EVIDENCE / "frontend/copy-catalog.json").read_text())
        review = json.loads((EVIDENCE / "frontend/diff-review-copy.json").read_text())
        strings = [s for s in catalog if isinstance(s, str)]
        for vals in review.get("copy_by_term", {}).values():
            strings.extend(vals)
        self.copy = strings
        self.libraries = json.dumps(review.get("diff_libraries_and_themes", ""))
        self.tables = {
            m.group(1): m.group(2)
            for m in re.finditer(r'CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?\s*\((.*?)\);', self.schema, re.S)
        }

    def resolve(self, anchor: dict) -> tuple[bool, str]:
        (kind, value), = anchor.items()
        if kind == "ledger":
            o = self.ledger.get(value)
            return (o is not None, f"ledger `{value}`" + (f" ({o['status']})" if o else ""))
        if kind == "schema":
            table, _, col = value.partition(".")
            body = self.tables.get(table)
            ok = body is not None and (not col or re.search(rf"\b{re.escape(col)}\b", body) is not None)
            return ok, f"schema `{value}`"
        if kind == "ipc":
            return f'"{value}"' in self.ipc, f"IPC `{value}`"
        if kind == "copy":
            rx = re.compile(re.escape(value), re.I)
            n = sum(1 for s in self.copy if rx.search(s))
            return n > 0, f"copy /{value}/ ({n} hit{'s' if n != 1 else ''})"
        if kind == "library":
            return value.lower() in self.libraries.lower(), f"library `{value}`"
        return False, f"unknown anchor {anchor}"


def probe(feature: dict, files: list[tuple[Path, set[str], str]]) -> dict[str, list[str]]:
    hits: dict[str, list[str]] = {}
    marker = re.compile(rf"parity:{re.escape(feature['id'])}(?::(\w+))?\b")
    for layer, patterns in feature["layers"].items():
        rxs = [re.compile(p, re.M) for p in patterns]
        found = []
        for path, layers, text in files:
            if path.suffix not in LAYER_SUFFIXES[layer]:
                continue
            m = marker.search(text)
            if m and (m.group(1) in (None, layer)):
                found.append(path.relative_to(ROOT).as_posix())
                continue
            if layer in layers and any(rx.search(text) for rx in rxs):
                found.append(path.relative_to(ROOT).as_posix())
        hits[layer] = found
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--features", default=str(EVIDENCE / "parity/chat-diff-pr/features.json"))
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--rea-compare", default=None, help="REA compare-application-versions summary JSON")
    ap.add_argument("--check-anchors", action="store_true", help="exit 1 if any evidence anchor no longer resolves")
    args = ap.parse_args()

    feat_path = Path(args.features)
    spec = json.loads(feat_path.read_text())
    out_dir = Path(args.out_dir) if args.out_dir else feat_path.parent
    rea_path = Path(args.rea_compare) if args.rea_compare else out_dir / "rea-compare-summary.json"
    rea = json.loads(rea_path.read_text()) if rea_path.exists() else None

    ev = Evidence()
    files = [(p, layer_of(p), p.read_text(errors="replace")) for p in implementation_files()]
    verifications = spec.get("verifications", {})

    results, broken = [], []
    for f in spec["features"]:
        anchors = [ev.resolve(a) for a in f["anchors"]]
        broken += [(f["id"], d) for ok, d in anchors if not ok]
        hits = probe(f, files)
        present = [l for l, h in hits.items() if h]
        verified = f["id"] in verifications
        score = 1.0 if verified else len(present) / len(f["layers"])
        status = "verified" if verified else ("absent" if not present else ("code" if score == 1 else "partial"))
        results.append({
            "id": f["id"], "area": f["area"], "title": f["title"], "status": status, "score": round(score, 3),
            "layers_required": list(f["layers"]), "layers_present": present,
            "missing_layers": [l for l in f["layers"] if l not in present],
            "hits": {l: h for l, h in hits.items() if h},
            "anchors": [d for _, d in anchors],
        })

    areas = {}
    for key, label in spec["areas"].items():
        rs = [r for r in results if r["area"] == key]
        areas[key] = {
            "label": label, "features": len(rs),
            "parity_pct": round(100 * sum(r["score"] for r in rs) / len(rs), 1),
            "strict_parity_pct": round(100 * sum(r["status"] == "verified" for r in rs) / len(rs), 1),
            "absent": sum(r["status"] == "absent" for r in rs),
            "partial": sum(r["status"] in ("partial", "code") for r in rs),
            "verified": sum(r["status"] == "verified" for r in rs),
        }
    total = {
        "features": len(results),
        "parity_pct": round(100 * sum(r["score"] for r in results) / len(results), 1),
        "strict_parity_pct": round(100 * sum(r["status"] == "verified" for r in results) / len(results), 1),
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "parity.json").write_text(json.dumps(
        {"ledger_id": ev.ledger_id, "areas": areas, "total": total, "features": results,
         "broken_anchors": broken, "implementation_files_scanned": len(files)}, indent=1) + "\n")
    (out_dir / "PARITY.md").write_text(render(spec, areas, total, results, broken, len(files), ev, rea))
    for key, a in areas.items():
        print(f"{key}: {a['parity_pct']}% (strict {a['strict_parity_pct']}%) over {a['features']} features")
    print(f"total: {total['parity_pct']}% (strict {total['strict_parity_pct']}%); broken anchors: {len(broken)}")
    return 1 if (args.check_anchors and broken) else 0


def render(spec, areas, total, results, broken, nfiles, ev, rea) -> str:
    L = []
    L.append("# Parity: chat, diff viewer and PR area\n")
    L.append("Generated by `python3 tools/parity_chat_diff_pr.py` from `features.json` in this folder. "
             "Do not edit by hand; rerun the tool after main changes.\n")
    L.append(f"Reference: REA evidence on main (ledger `{ev.ledger_id[:20]}...`, SQLite schema, IPC candidates, "
             "REA-derived copy catalogs). Implementation files scanned on this checkout: "
             f"**{nfiles}** (everything outside `evidence/`, `tools/`, `.github/`; test files excluded).\n")
    L.append("## Parity\n")
    L.append("| Area | Features | Parity (code layers present) | Strict parity (verified) | Absent | Partial | Verified |")
    L.append("|---|---|---|---|---|---|---|")
    for k, a in areas.items():
        L.append(f"| {k} | {a['features']} | **{a['parity_pct']}%** | {a['strict_parity_pct']}% | {a['absent']} | {a['partial']} | {a['verified']} |")
    L.append(f"| **all** | {total['features']} | **{total['parity_pct']}%** | {total['strict_parity_pct']}% | | | |\n")
    if rea:
        s = rea["summary"]
        L.append("## REA comparison (Conductor frontend vs OpenConductor main)\n")
        L.append(f"`rea compare-application-versions` (REA {rea.get('rea_version','?')}), left = Conductor v0.87.6 frontend Evidence "
                 f"`{rea['left_evidence_id'][:20]}...`, right = OpenConductor main @ `{rea.get('right_commit','?')[:7]}` "
                 f"Evidence `{rea['right_evidence_id'][:20]}...`.\n")
        L.append(f"- Items: unchanged {s['unchanged']}, changed {s['changed']}, added {s['added']}, removed {s['removed']}, unknown {s['unknown']}.")
        m = rea.get("matching", {})
        L.append(f"- Matching: {sum(v for k, v in m.items() if k not in ('unmatched','ambiguous'))} matched, "
                 f"{m.get('ambiguous', 0)} ambiguous, {m.get('unmatched', 0)} unmatched.")
        rs = rea.get("right_statistics", {})
        L.append(f"- OpenConductor main as REA sees it: {rs.get('parsed_javascript_files','?')} parsed JS file(s), "
                 f"{rs.get('visited_ast_nodes','?')} AST nodes; Conductor: {rea.get('left_statistics',{}).get('parsed_javascript_files','?')} files.")
        L.append("- REA matches by identity, content digest, source map or structural fingerprint, so a clean-room rebuild "
                 "will stay near 0 matched even at full feature parity. It measures shipped-surface overlap, not features; "
                 "the feature table above is the parity number.\n")
    L.append("## Gap list\n")
    for k in areas:
        L.append(f"### {k}\n")
        for r in results:
            if r["area"] != k or r["status"] == "verified":
                continue
            miss = ", ".join(r["missing_layers"]) or "behaviour check"
            have = f"; present: {', '.join(r['layers_present'])}" if r["layers_present"] else ""
            L.append(f"- **`{r['id']}`** ({int(r['score']*100)}%): {r['title']}. Missing: {miss}{have}.")
            L.append(f"  Evidence: {'; '.join(r['anchors'])}.")
            if r["hits"]:
                L.append(f"  Matched code: {'; '.join(f'{l}: ' + ', '.join(h) for l, h in r['hits'].items())}.")
        L.append("")
    L.append("## Limits of this check\n")
    L.append("- No screen evidence exists: `evidence/screens/` is absent on main because REA native UI capture "
             "(`observe-native-ui`, `capture-native-ui-scenario`) was denied Screen Recording and Accessibility on the Mac. "
             "Visual and interaction parity (layout, spacing, states) is therefore unmeasured.")
    L.append("- Layer probes are regex heuristics; a match means code exists, not that it behaves like Conductor. "
             "Builders can tag code with `parity:<feature-id>[:<layer>]` to be counted precisely.")
    L.append("- Ledger obligations for these areas are all still `unowned`/`blocked` (none `verified`).")
    if broken:
        L.append("\n## Broken evidence anchors\n")
        L += [f"- `{fid}`: {d}" for fid, d in broken]
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    sys.exit(main())
