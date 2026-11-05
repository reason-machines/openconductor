#!/usr/bin/env python3
"""Parity check for the chat, diff viewer and PR areas against REA evidence.

Reads a features file (default evidence/parity/chat-diff-pr/features.json),
confirms every evidence anchor still resolves in the REA evidence on this
checkout, probes the implementation files for each feature layer, and writes
a Markdown report plus a JSON result.

Scoring per feature: the hand-reviewed verdict in reviews.json (implemented
1, partial 0.5, unwired or backend-only 0.25, missing 0) is the parity number.
Verified (listed in `verifications`) = 1.0. The code-layer score (fraction of
layers whose probe matched) is kept alongside as a heuristic; a feature whose
matched files changed since the review is flagged for re-review. Strict parity
counts only verified features.

Usage: tools/parity_chat_diff_pr.py [--features PATH] [--out-dir DIR]
                                    [--rea-compare PATH] [--check-anchors]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / "evidence"

# Implementation files probed per layer. Evidence, tools and docs never count.
EXCLUDED_TOP = {"evidence", "tools", ".git", ".github", "node_modules", "target", "dist"}
CODE_SUFFIXES = {".rs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".sql", ".svelte", ".vue", ".json"}
LAYER_SUFFIXES = {
    "data": {".sql", ".rs", ".ts"},
    "backend": {".rs", ".ts", ".js", ".mjs"},
    "command": {".rs", ".ts", ".js", ".mjs"},
    "ui": {".ts", ".tsx", ".js", ".jsx", ".css", ".svelte", ".vue"},
    "keybinding": {".ts", ".tsx", ".json"},
}


def layer_of(path: Path) -> set[str]:
    rel = path.relative_to(ROOT).as_posix()
    if rel.startswith("src-tauri/"):
        return {"data", "backend", "command"}
    if rel.startswith(("sidecar/", "server/", "runtime/")):
        return {"data", "backend", "command"}
    if "/keybindings/" in f"/{rel}":
        return {"keybinding"}
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
        if p.name == "tests.rs" or p.name.endswith(("_test.rs", "_tests.rs", ".test.ts", ".test.tsx")):
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


VERDICTS = ("verified", "implemented", "partial", "unwired", "backend-only", "missing", "unreviewed")


def git(*args: str) -> str | None:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def head_sha() -> str | None:
    out = git("rev-parse", "--short", "HEAD")
    return out.strip() if out else None


def changed_since(sha: str | None) -> set[str] | None:
    """Files changed between the review commit and HEAD; None when unknown (shallow clone)."""
    if not sha:
        return None
    out = git("diff", "--name-only", f"{sha}..HEAD")
    return None if out is None else set(out.split())


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
    rev_path = feat_path.parent / "reviews.json"
    reviews = json.loads(rev_path.read_text()) if rev_path.exists() else {"features": {}, "weights": {}}
    changed = changed_since(reviews.get("reviewed_at"))
    screens_path = feat_path.parent / "screens" / "screens.json"
    screens = json.loads(screens_path.read_text()) if screens_path.exists() else None

    results, broken = [], []
    for f in spec["features"]:
        anchors = [ev.resolve(a) for a in f["anchors"]]
        broken += [(f["id"], d) for ok, d in anchors if not ok]
        hits = probe(f, files)
        present = [l for l, h in hits.items() if h]
        verified = f["id"] in verifications
        code_score = len(present) / len(f["layers"])
        review = reviews["features"].get(f["id"])
        if verified:
            score, status = 1.0, "verified"
        elif review:
            score, status = reviews["weights"][review["verdict"]], review["verdict"]
        else:
            score, status = code_score, "unreviewed"
        hit_files = sorted({h for hs in hits.values() for h in hs})
        stale = changed is None or any(h in changed for h in hit_files) if review else True
        results.append({
            "id": f["id"], "area": f["area"], "title": f["title"], "status": status, "score": round(score, 3),
            "code_score": round(code_score, 3), "needs_rereview": bool(stale),
            "why": review["why"] if review else None, "obligation": review["obligation"] if review else None,
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
            "code_layer_pct": round(100 * sum(r["code_score"] for r in rs) / len(rs), 1),
            "strict_parity_pct": round(100 * sum(r["status"] == "verified" for r in rs) / len(rs), 1),
            "by_verdict": {v: sum(r["status"] == v for r in rs) for v in VERDICTS if any(r["status"] == v for r in rs)},
            "verified": sum(r["status"] == "verified" for r in rs),
            "needs_rereview": sum(r["needs_rereview"] for r in rs),
        }
    total = {
        "features": len(results),
        "parity_pct": round(100 * sum(r["score"] for r in results) / len(results), 1),
        "code_layer_pct": round(100 * sum(r["code_score"] for r in results) / len(results), 1),
        "strict_parity_pct": round(100 * sum(r["status"] == "verified" for r in results) / len(results), 1),
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "parity.json").write_text(json.dumps(
        {"ledger_id": ev.ledger_id, "reviewed_at": reviews.get("reviewed_at"), "head": head_sha(), "areas": areas, "total": total, "features": results,
         "broken_anchors": broken, "implementation_files_scanned": len(files)}, indent=1) + "\n")
    (out_dir / "PARITY.md").write_text(render(spec, areas, total, results, broken, len(files), ev, rea, reviews, screens))
    for key, a in areas.items():
        print(f"{key}: {a['parity_pct']}% reviewed, {a['code_layer_pct']}% code layers (strict {a['strict_parity_pct']}%) "
              f"over {a['features']} features; {a['needs_rereview']} need re-review")
    print(f"total: {total['parity_pct']}% (strict {total['strict_parity_pct']}%); broken anchors: {len(broken)}")
    return 1 if (args.check_anchors and broken) else 0


def render(spec, areas, total, results, broken, nfiles, ev, rea, reviews, screens) -> str:
    L = []
    L.append("# Parity: chat, diff viewer and PR area\n")
    L.append("Generated by `python3 tools/parity_chat_diff_pr.py` from `features.json` and `reviews.json` in this folder. "
             "Do not edit by hand; rerun the tool after main changes.\n")
    L.append(f"Checkout `{head_sha()}`; verdicts reviewed by hand at `{reviews.get('reviewed_at')}`. Reference: REA evidence on main "
             f"(ledger `{ev.ledger_id[:20]}...`, SQLite schema, IPC candidates, REA-derived copy catalogs, `evidence/screens`). "
             f"Implementation files scanned: **{nfiles}** (everything outside `evidence/`, `tools/`, `.github/`; test files excluded).\n")
    L.append("## Parity\n")
    L.append("Parity is the mean reviewed verdict: " + ", ".join(f"{k} {v}" for k, v in reviews.get("weights", {}).items()) +
             ". The code-layer column is the regex and `parity:` tag heuristic, shown for comparison only. "
             "Strict parity counts features verified against the reference.\n")
    L.append("| Area | Features | Parity (reviewed) | Code layers (heuristic) | Strict (verified) | Verdicts | Need re-review |")
    L.append("|---|---|---|---|---|---|---|")
    for k, a in areas.items():
        v = ", ".join(f"{n} {c}" for n, c in a["by_verdict"].items())
        L.append(f"| {k} | {a['features']} | **{a['parity_pct']}%** | {a['code_layer_pct']}% | {a['strict_parity_pct']}% | {v} | {a['needs_rereview']} |")
    L.append(f"| **all** | {total['features']} | **{total['parity_pct']}%** | {total['code_layer_pct']}% | {total['strict_parity_pct']}% | | |\n")
    L.append("Verdict levels:\n")
    L += [f"- `{k}`: {v}" for k, v in reviews.get("levels", {}).items()]
    L.append("")
    if screens:
        L.append("## Screen comparison (REA)\n")
        L.append(f"Ours: the Vite build captured with {screens['tool']} ({screens['browser']}), the same setup as `evidence/screens`. "
                 "Rerun with `tools/parity_chat_diff_pr_screens.mjs`. Pixel ratios are REA `compare-web-screenshots` against the reference; "
                 "content differs (synthetic data on both sides), so they measure layout and colour, not features.\n")
        L.append("| Ours | Reference | Differ at t=0 | Differ at t=24 | Comparison Evidence (t=24) |")
        L.append("|---|---|---|---|---|")
        for r in screens["results"]:
            c0, c24 = r["compare"]["threshold_0"], r["compare"]["threshold_24"]
            L.append(f"| [{r['name']}]({r['file']}) | [{r['reference'].split('/')[-1]}](../../{r['reference'].removeprefix('evidence/')}) | "
                     f"{100 * c0['changed_ratio']:.1f}% | {100 * c24['changed_ratio']:.1f}% | `{c24['evidence_id'][:16]}…` |")
        L.append("")
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
        L.append("- REA matches by identity, content digest, source map or structural fingerprint, so a clean-room rebuild "
                 "stays near 0 matched even at full feature parity. It measures shipped-surface overlap, not features.\n")
    L.append("## Gap list and builder obligations\n")
    for k in areas:
        L.append(f"### {k}\n")
        issue = reviews.get("obligation_issues", {}).get(k)
        if issue:
            L.append(f"Builder obligations are tracked in {issue}.\n")
        for r in results:
            if r["area"] != k or r["status"] in ("verified", "implemented"):
                continue
            flag = " **(code changed since review)**" if r["needs_rereview"] else ""
            L.append(f"- **`{r['id']}`** ({r['status']}, code layers {int(r['code_score'] * 100)}%){flag}: {r['title']}.")
            if r["why"]:
                L.append(f"  Finding: {r['why']}")
            if r["obligation"]:
                L.append(f"  Obligation: {r['obligation']}")
            L.append(f"  Evidence: {'; '.join(r['anchors'])}.")
        L.append("")
    L.append("## Limits of this check\n")
    L.append("- Verdicts are read from the code at the review commit; rerun flags features whose matched files changed since then, "
             "and those need a fresh read before their verdict is trusted.")
    L.append("- No feature is `verified`: nothing in these areas reaches real data in the running app yet, so no behaviour could be "
             "compared with the reference. Screens compare our browser build (sample diff data, local placeholder chat) with "
             "the reference harness captures.")
    L.append("- Ledger obligations for these areas are all still `unowned`/`blocked` (none `verified`).")
    if broken:
        L.append("\n## Broken evidence anchors\n")
        L += [f"- `{fid}`: {d}" for fid, d in broken]
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    sys.exit(main())
