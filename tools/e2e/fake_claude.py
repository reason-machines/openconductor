#!/usr/bin/env python3
"""A stand-in for the `claude` CLI in stream-json mode, for the slash-menu e2e.

It answers the `initialize` control request with a command list shaped like
Claude Code 2.1.318's (a user skill, a plugin skill with an alias, a built-in
with an argument hint): user skills from $HOME/.claude/skills/<name>/SKILL.md,
project skills from ./.claude/skills, and the plugin skills of every
--plugin-dir (named "<plugin>:<skill>"), as the real CLI lists them.

A user message that starts with "/<name>" for a listed skill runs it: the
reply is the skill body's first line that is all capitals and dashes (the
fixture says "OC-FIXTURE-SKILL-RAN"), then the arguments. Any other message
gets "echo: <text>". Each turn ends with a `result` line.
"""
import json
import os
import sys
import uuid

SESSION = str(uuid.uuid4())


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def front_matter(path):
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return None
    if not text.startswith("---"):
        return None
    head, _, body = text[3:].partition("\n---")
    meta = {}
    for line in head.splitlines():
        key, sep, value = line.partition(":")
        if sep:
            meta[key.strip()] = value.strip().strip("'\"")
    if not meta.get("name") or not meta.get("description"):
        return None
    return meta["name"], meta["description"], body


def skills_in(folder):
    found = []
    try:
        names = sorted(os.listdir(folder))
    except OSError:
        return found
    for name in names:
        meta = front_matter(os.path.join(folder, name, "SKILL.md"))
        if meta:
            found.append(meta)
    return found


def plugin_dirs(argv):
    return [argv[i + 1] for i, a in enumerate(argv[:-1]) if a == "--plugin-dir"]


def commands():
    out = {}
    for name, desc, body in skills_in(os.path.join(os.environ.get("HOME", ""), ".claude", "skills")):
        out[name] = ({"name": name, "description": f"{desc} (user)", "argumentHint": ""}, body)
    for name, desc, body in skills_in(os.path.join(os.getcwd(), ".claude", "skills")):
        out[name] = ({"name": name, "description": f"{desc} (project)", "argumentHint": ""}, body)
    for plugin in plugin_dirs(sys.argv):
        try:
            pname = json.load(open(os.path.join(plugin, ".claude-plugin", "plugin.json")))["name"]
        except (OSError, ValueError, KeyError):
            continue
        for name, desc, body in skills_in(os.path.join(plugin, "skills")):
            full = f"{pname}:{name}"
            out[full] = ({"name": full, "description": f"({pname}) {desc}", "argumentHint": "", "aliases": [name]}, body)
    out["review"] = ({"name": "review", "description": "Review a pull request", "argumentHint": "[pr]"}, None)
    return out


def reply(text):
    send({"type": "assistant", "session_id": SESSION,
          "message": {"role": "assistant", "content": [{"type": "text", "text": text}]}})
    send({"type": "result", "subtype": "success", "is_error": False, "result": text,
          "session_id": SESSION, "num_turns": 1})


send({"type": "system", "subtype": "init", "session_id": SESSION, "model": "fake-claude",
      "permissionMode": "bypassPermissions"})
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)
    if msg.get("type") == "control_request":
        sub = (msg.get("request") or {}).get("subtype")
        body = {"commands": [c for c, _ in commands().values()]} if sub == "initialize" else {}
        send({"type": "control_response",
              "response": {"subtype": "success", "request_id": msg.get("request_id"), "response": body}})
    elif msg.get("type") == "user":
        text = "".join(b.get("text", "") for b in msg["message"]["content"] if b.get("type") == "text")
        cmd, _, args = text.partition(" ")
        known = commands()
        skill = known.get(cmd[1:]) if cmd.startswith("/") else None
        if skill is None and cmd.startswith("/"):
            skill = next((v for v in known.values() if cmd[1:] in v[0].get("aliases", [])), None)
        if skill and skill[1] is not None:
            marker = next((l.strip() for l in skill[1].splitlines() if l.strip() and l.strip().replace("-", "").isupper()), "SKILL")
            reply(f"{marker} {args}".strip())
        else:
            reply(f"echo: {text}")
