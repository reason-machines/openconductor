#!/usr/bin/env python3
"""Summary of a tools/slash-menu/run-e2e-mac.sh run: per agent, the "/" menu
(items, skills, the fixture's row), the filter, the picked draft, and the
turn the pick ran, with the agent's reply read from its chat events
(<agent>-chat-events.jsonl, written by the debug e2e seam).

A skill ran when the turn completed and, for the fixture skill, the reply
carries its marker (OC-FIXTURE-SKILL-RAN) and the arguments sent with it.

Usage: summarize.py OUT
"""
import json
import os
import sys

out = sys.argv[1]
report = json.load(open(os.path.join(out, "slash-menu.json")))


def reply(agent):
    """The text of the last completed turn in <agent>-chat-events.jsonl."""
    path = os.path.join(out, f"{agent}-chat-events.jsonl")
    if not os.path.exists(path):
        return None, None
    turns, text, msgs = [], [], {}
    for line in open(path):
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        t = ev.get("type")
        if t == "text" and "itemId" not in ev:
            text.append(ev.get("text", ""))
        elif t == "text":
            msgs[ev["itemId"]] = msgs.get(ev["itemId"], "") + ev.get("delta", "")
        elif t == "message":
            msgs[ev.get("itemId", "")] = ev.get("text", "")
        elif t == "turnEnded":
            end = ev.get("end", {})
            turns.append(("".join(text) + "\n".join(msgs.values())).strip() or None)
            turns[-1] = (turns[-1], end.get("outcome") or end.get("status"))
            text, msgs = [], {}
    return turns[-1] if turns else (None, None)


lines = [f"result: {report.get('result')}"]
summary = {"result": report.get("result"), "agents": []}
for a in report.get("agents", []):
    menu = a.get("menu") or {}
    rows = menu.get("rows") or []
    text, outcome = reply(a["id"])
    turn = a.get("turn") or {}
    entry = {
        "agent": a["id"],
        "menuItems": menu.get("count"),
        "menuSkills": menu.get("skills"),
        "headings": menu.get("headings"),
        "menuMs": menu.get("ms"),
        "filter": (a.get("filtered") or {}).get("query"),
        "filtered": [r["name"] for r in (a.get("filtered") or {}).get("rows", [])],
        "inserted": a.get("inserted"),
        "sent": a.get("sent"),
        "turnStatus": turn.get("status"),
        "turnError": turn.get("error"),
        "reply": text,
        "eventOutcome": outcome,
        "error": a.get("error"),
    }
    fixture = next((r for r in rows if r["name"] == "oc-fixture-skill"), None)
    entry["fixtureRow"] = fixture
    marker = "OC-FIXTURE-SKILL-RAN"
    if a["id"] == "reason":
        entry["ran"] = turn.get("status") == "completed" and bool(text)
    else:
        entry["ran"] = turn.get("status") == "completed" and bool(text) and marker in text
    summary["agents"].append(entry)
    lines.append(
        f"{a['id']}: menu {entry['menuItems']} items ({entry['menuSkills']} skills, {entry['menuMs']} ms); "
        f"/{entry['filter']} -> {entry['filtered']}; picked {entry['inserted']!r}; "
        f"turn {entry['turnStatus']}{' (' + entry['turnError'] + ')' if entry['turnError'] else ''}; "
        f"ran: {entry['ran']}; reply: {(text or '')[:160]!r}"
    )
json.dump(summary, open(os.path.join(out, "summary.json"), "w"), indent=2)
print("\n".join(lines))
