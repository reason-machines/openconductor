#!/usr/bin/env python3
"""Parity check for the Reason agent over ACP (chats run by the `reason` CLI).

Conductor has no Reason agent, so these items are OpenConductor's own
obligations for it. Each names the REA ledger obligation it serves
(`evidence/ledger/reviewed-obligations.json`) and is probed in a git ref:
every probe (file, regex) must match. Items whose authority is `runtime`
also need a recorded evidence file; a probe of the tree cannot pass them.

Scoring: matched 1, missing 0, equal weight. Writes PARITY.md and
parity.json to evidence/parity/reason-acp/ (or --out-dir).

Usage: tools/parity_reason_acp.py [--ref REF] [--out-dir DIR]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "evidence/ledger/reviewed-obligations.json"

# (id, title, parent REA ledger obligation, authority, probes)
ITEMS = [
    ("acp.module", "reason_acp (ACP client and provider) and reason_chat are modules of the app", "agent.session-run", "static",
     [("src-tauri/src/lib.rs", r"^pub mod reason_acp;"), ("src-tauri/src/lib.rs", r"^pub mod reason_chat;"),
      ("src-tauri/src/lib.rs", r"ReasonChats::default\(\)")]),
    ("acp.commands", "Tauri commands reason_cli_path, reason_open_chat, reason_prompt, reason_cancel, reason_list_sessions registered", "agent.session-run", "static",
     [("src-tauri/src/lib.rs", rf"reason_chat::{c}\b") for c in
      ("reason_cli_path", "reason_open_chat", "reason_prompt", "reason_cancel", "reason_list_sessions")]),
    ("acp.agent-kind", "Reason agent kind that signs in through the reason CLI (reason_login, no API key)", "agent.providers", "CI test",
     [("src-tauri/src/agent/reason.rs", r'"reason_login"'), ("src-tauri/src/agent/byok.rs", r"AgentKind::Reason => ProviderConfig::ReasonLogin")]),
    ("acp.settings-slot", "providers.reason settings slot, validated like the other agents", "agent.providers", "CI test",
     [("src-tauri/src/settings/model.rs", r"pub reason: Option<ProviderConfig>"), ("src-tauri/src/settings/tests.rs", r"providers\.reason")]),
    ("acp.paths", "Tool paths marked local (workspace folder) or cloud (a Session's /repo checkout) with the same relative path", "agent.session-run", "CI test",
     [("src-tauri/src/reason_acp/updates.rs", r"pub fn map_path"), ("src-tauri/src/reason_acp/provider_tests.rs", r"fn reports_and_cloud_paths_are_told_apart")]),
    ("acp.chat-adapter", "Chat adapter turns Reason events into the transcript; its frontend tests run in CI", "agent.session-run", "CI test",
     [("src/features/chat/reason.test.ts", r"one chat shows a local home path, then a cloud /repo path in a follow-up"),
      (".github/workflows/ci.yml", r'node --test "src/\*\*/\*\.test\.ts"')]),
    ("acp.chat-panel", "The desktop chat panel sends every message to Reason and shows Stop while a turn runs", "agent.message-queue", "static",
     [("src/components/WorkspaceView.tsx", r"sendReason\(workspace\.id, cwd, text\)"), ("src/components/WorkspaceView.tsx", r"stopReason\(workspace\.id\)")]),
    ("acp.resume", "One Reason Session per workspace; it resumes after an app restart or a CLI crash", "agent.message-queue", "CI test",
     [("src/features/chat/reasonChat.ts", r"openconductor\.reason\.session\."),
      ("src-tauri/src/reason_acp/provider_tests.rs", r"fn a_stored_session_resumes_after_restart_and_after_a_crash")]),
    ("acp.live-cli", "The real reason CLI starts and answers initialize, required in CI on macOS and Linux", "agent.session-run", "CI live (real CLI, no sign-in)",
     [(".github/workflows/reason-acp.yml", r'REASON_ACP_REQUIRE_LIVE: "1"'), (".github/workflows/reason-acp.yml", r"reasonmachines\.com/install\.sh"),
      ("src-tauri/src/reason_acp/cli_tests.rs", r"fn live_cli_answers_initialize"), ("src-tauri/src/reason_acp/cli_tests.rs", r"fn dyld_variables_are_not_passed_to_reason")]),
    ("acp.e2e", "End-to-end through the built app: local path, cloud /repo follow-up, third turn in the same Session, Stop", "agent.session-run", "CI e2e (fake CLI)",
     [(".github/workflows/e2e.yml", r"tools/e2e/reason-chat\.e2e\.mjs"), ("tools/e2e/reason-chat.e2e.mjs", r'send\("cloud"\)'),
      ("tools/reason-acp/fake_reason_acp.py", r'cmd == "local"')]),
    ("acp.signed-in", "Signed-in reason CLI on a Mac: one chat shows a home-folder path locally, then a cloud /repo path, then a follow-up", "agent.session-run", "runtime",
     [("evidence/reason-acp/signed-in-run.json", r'"result":\s*"pass"')]),
]


def reader(ref: str | None):
    def read(path: str) -> str | None:
        if ref is None:
            p = ROOT / path
            return p.read_text() if p.is_file() else None
        r = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT, capture_output=True, text=True)
        return r.stdout if r.returncode == 0 else None
    return read


def check(ref: str | None) -> dict:
    read = reader(ref)
    ledger = {o["obligation_id"] for o in json.loads(LEDGER.read_text())}
    items = []
    for iid, title, parent, authority, probes in ITEMS:
        if parent not in ledger:
            sys.exit(f"{iid}: parent obligation {parent} is not in {LEDGER.relative_to(ROOT)}")
        results = []
        for path, pattern in probes:
            text = read(path)
            ok = text is not None and re.search(pattern, text, re.M) is not None
            results.append({"file": path, "pattern": pattern, "matched": ok, "file_exists": text is not None})
        status = "matched" if all(r["matched"] for r in results) else "missing"
        items.append({"id": iid, "title": title, "parent": parent, "authority": authority, "status": status, "probes": results})
    matched = sum(i["status"] == "matched" for i in items)
    sha = None
    if ref is not None:
        sha = subprocess.run(["git", "rev-parse", "--short=12", ref], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return {"ref": ref or "working tree", "sha": sha, "items": items, "matched": matched, "total": len(items),
            "parity": round(100 * matched / len(items), 1)}


def render(r: dict) -> str:
    target = f"`{r['ref']}` at `{r['sha']}`" if r["sha"] else r["ref"]
    out = [
        "# Parity: Reason agent over ACP",
        "",
        f"Target {target}. Generated by `tools/parity_reason_acp.py`; rerun with `python3 tools/parity_reason_acp.py --ref origin/main`.",
        "",
        "Conductor has no Reason agent, so these are OpenConductor's own obligations for it, each filed under the REA ledger obligation it serves. "
        "An item is matched when every probe matches in the tree; `runtime` items also need recorded evidence.",
        "",
        f"**Parity: {r['parity']}%** ({r['matched']} of {r['total']} matched)",
        "",
        "| Item | Parent obligation | Verified by | Status |",
        "|---|---|---|---|",
    ]
    for i in r["items"]:
        out.append(f"| `{i['id']}` {i['title']} | `{i['parent']}` | {i['authority']} | {i['status']} |")
    missing = [i for i in r["items"] if i["status"] != "matched"]
    if missing:
        out += ["", "## Open", ""]
        for i in missing:
            failed = ", ".join(f"`{p['file']}`" + ("" if p["file_exists"] else " (no file)") for p in i["probes"] if not p["matched"])
            out.append(f"- `{i['id']}`: {failed}")
    out += [
        "",
        "## Limits",
        "",
        "- Static and CI items prove code and tests exist on the target; the CI jobs named under \"Verified by\" are what run them.",
        "- `acp.e2e` drives the built app on Linux (WebKitWebDriver) against `tools/reason-acp/fake_reason_acp.py`; macOS has no WebDriver for WKWebView.",
        "- `acp.live-cli` runs the real CLI without a sign-in, so it covers startup and `initialize` only.",
        "- `acp.signed-in` passes only once `evidence/reason-acp/signed-in-run.json` records a signed-in run with `\"result\": \"pass\"`.",
        "",
    ]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ref", help="git ref to probe (default: the working tree)")
    ap.add_argument("--out-dir", default=str(ROOT / "evidence/parity/reason-acp"))
    a = ap.parse_args()
    r = check(a.ref)
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "parity.json").write_text(json.dumps(r, indent=2) + "\n")
    (out / "PARITY.md").write_text(render(r))
    print(f"Reason ACP parity {r['parity']}% ({r['matched']}/{r['total']}) -> {out}")


if __name__ == "__main__":
    main()
