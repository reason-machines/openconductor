#!/usr/bin/env python3
"""Summarise one tools/auth/run-auth-modes-mac.sh run as evidence JSON.

Reads OUT/<agent>-auth-modes.json (the in-app driver's report), OUT/key.json
(the API key's fingerprint, never its value), OUT/cli-version.txt and the
CLI's own sign-in state,. Writes OUT/summary.json and prints one line per mode.
"""
import json
import os
import platform
import subprocess
import sys


def read(path, default=None):
    try:
        with open(path) as f:
            return json.load(f) if path.endswith(".json") else f.read().strip()
    except (OSError, ValueError):
        return default


def main(out):
    reports = [f for f in os.listdir(out) if f.endswith("-auth-modes.json")]
    if not reports:
        sys.exit("no report")
    report = read(os.path.join(out, reports[0]))
    agent = report.get("agent") or reports[0].split("-")[0]
    key = read(os.path.join(out, "key.json"), {})
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    except OSError:
        commit = None
    modes = []
    for m in report.get("modes", []):
        t, tab = m["turn"], m["tab"]
        modes.append({
            "mode": m["id"],
            "card": tab.get("card"),
            "set_in_app": m.get("card") is not None,
            "stored": tab.get("stored"),
            "connected": tab.get("connected"),
            "login_prompt": tab.get("loginPrompt"),
            "key_fingerprint": key.get("fingerprint") if m.get("secret") else None,
            "turn": {k: t.get(k) for k in ("status", "error", "signInNotice", "reply", "seconds")},
            "result": "pass" if m.get("pass") else "fail",
        })
    if not any(m["mode"] == "apikey" for m in modes):
        modes.append({"mode": "apikey", "result": "not run",
                      "reason": f"no {key.get('name', 'API key')} reference given (OC_E2E_*_OP_REF)"})
    summary = {
        "agent": agent,
        "app_commit": commit,
        "host": {"os": platform.platform(), "machine": platform.machine()},
        "cli_version": read(os.path.join(out, "cli-version.txt")),
        "cli_auth_in_throwaway_home": read(os.path.join(out, "cli-auth.json")) or read(os.path.join(out, "cli-auth.txt")),
        "started": report.get("started"),
        "ended": report.get("ended"),
        "error": report.get("error"),
        "modes": modes,
        "result": report.get("result"),
    }
    with open(os.path.join(out, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)
    for m in modes:
        if m["result"] == "not run":
            print(f'{agent} {m["mode"]}: not run ({m["reason"]})')
            continue
        t = m["turn"]
        print(f'{agent} {m["mode"]}: {m["result"]} card={m["card"]} connected={m["connected"]} '
              f'loginPrompt={m["login_prompt"]} turn={t["status"]} reply={t["reply"]!r} error={t["error"]!r} ({t["seconds"]}s)')
    if report.get("error"):
        print("error:", report["error"].splitlines()[0])
    print(f'{agent}: {report.get("result")}')


if __name__ == "__main__":
    main(sys.argv[1])
