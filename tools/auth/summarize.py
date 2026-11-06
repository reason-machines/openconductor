#!/usr/bin/env python3
"""Summarise one tools/auth/run-auth-modes-mac.sh run as evidence JSON.

Reads OUT/<agent>-auth-modes.json (the in-app driver's report), OUT/key.json
(the API key's fingerprint, never its value), OUT/cli-version.txt and the
CLI's own sign-in state. Writes OUT/summary.json and prints one line per mode.
"""
import json
import os
import platform
import re
import subprocess
import sys


def read(path, default=None):
    try:
        with open(path) as f:
            return json.load(f) if path.endswith(".json") else f.read().strip()
    except (OSError, ValueError):
        return default


# A provider's own usage or rate limit: the app got the turn to the provider
# with the selected credential and the provider refused it. Not an app bug.
PROVIDER_LIMIT = re.compile(
    r"hit your (weekly|daily|usage|session|5-hour)? ?limit|usage limit|rate limit|quota|"
    r"insufficient_quota|limit .{0,40}resets", re.I)


def classify(m, t, tab):
    if m.get("pass"):
        return "pass", None
    if (tab.get("connected") and not tab.get("loginPrompt") and not t.get("signInNotice")
            and t.get("status") == "failed" and PROVIDER_LIMIT.search(t.get("error") or "")):
        return "blocked-by-provider", "the provider refused the turn with its own usage limit; the app was connected with no sign-in prompt"
    return "fail", None


def overall(modes):
    results = [m["result"] for m in modes]
    if "fail" in results:
        return "fail"
    if all(r == "pass" for r in results):
        return "pass"
    return "partial"


def main(out):
    reports = [f for f in os.listdir(out) if f.endswith("-auth-modes.json")]
    if not reports:
        sys.exit("no report")
    report = read(os.path.join(out, reports[0]))
    agent = report.get("agent") or reports[0].split("-")[0]
    key = read(os.path.join(out, "key.json"), {})
    key_only = bool(read(os.path.join(out, "run.json"), {}).get("key_only"))
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    except OSError:
        commit = None
    modes = []
    for m in report.get("modes", []):
        t, tab = m["turn"], m["tab"]
        result, reason = classify(m, t, tab)
        entry = {
            "mode": m["id"],
            "card": tab.get("card"),
            "set_in_app": m.get("card") is not None,
            "stored": tab.get("stored"),
            "connected": tab.get("connected"),
            "login_prompt": tab.get("loginPrompt"),
            "key_fingerprint": key.get("fingerprint") if m.get("secret") else None,
            "turn": {k: t.get(k) for k in ("status", "error", "signInNotice", "reply", "seconds")},
            "result": result,
        }
        if reason:
            entry["reason"] = reason
        modes.append(entry)
    if not any(m["mode"] == "apikey" for m in modes):
        modes.append({"mode": "apikey", "result": "not run",
                      "reason": f"no {key.get('name', 'API key')} reference given (OC_E2E_*_OP_REF)"})
    summary = {
        "agent": agent,
        "app_commit": commit,
        "host": {"os": platform.platform(), "machine": platform.machine()},
        "cli_version": read(os.path.join(out, "cli-version.txt")),
        "key_only_control": key_only,
        "cli_auth_in_throwaway_home": read(os.path.join(out, "cli-auth.json")) or read(os.path.join(out, "cli-auth.txt")),
        "started": report.get("started"),
        "ended": report.get("ended"),
        "error": report.get("error"),
        "modes": modes,
        "driver_result": report.get("result"),
        "result": overall(modes),
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
    print(f'{agent}: {summary["result"]}')


if __name__ == "__main__":
    main(sys.argv[1])
