#!/usr/bin/env python3
"""Stand-in for the `claude` CLI (Claude Code) in tools/e2e/claude-chat.e2e.mjs.

Speaks the stream-json protocol OpenConductor drives Claude Code with
(`--input-format stream-json --output-format stream-json`): one `system/init`,
then for each user line an assistant message and a `result`.

The reply names the credential Claude Code would use, in Claude Code's
documented precedence: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY,
CLAUDE_CODE_OAUTH_TOKEN, then its own login (~/.claude/.credentials.json).
With none of them it answers like a signed-out Claude Code.

Every launch and stdin line is appended to $HOME/claude-fake.jsonl with the
process pid. Credential variables are logged as a sha256 fingerprint (16 hex)
or null, never their values.

OC_FAKE_CLAUDE tags the launch line (a custom executable-path wrapper sets it).
"""

import hashlib
import json
import os
import sys

HOME = os.environ.get("HOME", "")
LOG = os.path.join(HOME, "claude-fake.jsonl")
VERSION = "2.1.319 (Claude Code)"
CRED_VARS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN")


def fingerprint(value):
    return hashlib.sha256(value.encode()).hexdigest()[:16] if value else None


def log(entry):
    entry["pid"] = os.getpid()
    with open(LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


def login_file():
    return os.path.isfile(os.path.join(HOME, ".claude", ".credentials.json"))


def auth_used():
    if os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "auth-token"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "apikey"
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return "oauth-token"
    if login_file():
        return "login"
    return None


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def user_text(msg):
    content = (msg.get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
    return ""


def main(argv):
    if "--version" in argv or "-v" in argv:
        print(VERSION)
        return 0
    if argv[:2] == ["auth", "status"]:
        print(json.dumps({"loggedIn": auth_used() is not None, "authMethod": auth_used()}))
        return 0
    log(
        {
            "launch": {
                "launcher": os.environ.get("OC_FAKE_CLAUDE", "path"),
                "args": argv,
                "keys": {k: fingerprint(os.environ.get(k)) for k in CRED_VARS},
                "oauth_scopes": os.environ.get("CLAUDE_CODE_OAUTH_SCOPES"),
                "base_url": os.environ.get("ANTHROPIC_BASE_URL"),
                "login_file": login_file(),
                "auth": auth_used(),
            }
        }
    )
    if "stream-json" not in argv:
        return 0
    session = "fake-claude-%d" % os.getpid()
    started = False
    turns = 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        log({"stdin": msg})
        if msg.get("type") == "control_request" and (msg.get("request") or {}).get("subtype") == "interrupt":
            emit({"type": "result", "subtype": "error_during_execution", "is_error": True, "session_id": session})
            continue
        if msg.get("type") != "user":
            continue
        if not started:
            emit({"type": "system", "subtype": "init", "session_id": session, "permissionMode": "bypassPermissions"})
            started = True
        turns += 1
        auth = auth_used()
        if auth is None:
            text = "Invalid API key · Please run /login"
            emit({"type": "assistant", "session_id": session, "message": {"id": "m%d" % turns, "content": [{"type": "text", "text": text}]}})
            emit({"type": "result", "subtype": "success", "is_error": True, "result": text, "session_id": session})
            continue
        text = "turn %d: %s (auth: %s)" % (turns, user_text(msg), auth)
        emit({"type": "assistant", "session_id": session, "message": {"id": "m%d" % turns, "content": [{"type": "text", "text": text}]}})
        emit({"type": "result", "subtype": "success", "is_error": False, "result": text, "session_id": session})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
