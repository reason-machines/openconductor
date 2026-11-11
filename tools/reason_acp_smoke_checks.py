"""Assertions for the signed-in Reason local/cloud smoke. No inference runs here."""
from pathlib import Path

MODEL = "byok:openai-codex:gpt-6.1-sol"
SOURCE = "openai-codex:42b88e79-2ef2-4e3e-93b1-8c93dcad16a7"
WORKSPACE = "reason-tests"


def check_source(payload, model, source):
    data = payload.get("data", payload)
    models = [m for m in data.get("models", [])
              if m.get("id") == model and m.get("available") is True]
    sources = sorted({m.get("source_id", "") for m in models})
    result = {"model": model, "required_source": source, "available_sources": sources}
    result["allowed"] = (model == MODEL and source.startswith("openai-codex:")
                         and sources == [source])
    return result


def computer_kind(update, fallback):
    return ((update.get("_meta") or {}).get("com.reasonmachines/computer") or {}).get("kind", fallback)


def completed_write(turn, place, text):
    tools = {}
    for update in turn.get("tools", []):
        tool_id = update.get("toolCallId")
        if tool_id:
            tools.setdefault(tool_id, {}).update(update)
    for tool in tools.values():
        if (tool.get("kind") != "edit" or tool.get("status") != "completed"
                or tool.get("place") != place):
            continue
        for content in tool.get("content") or []:
            if (content.get("type") == "diff"
                    and Path(content.get("path", "")).name == "acp-check.txt"
                    and content.get("newText", "").strip() == text):
                return True
    return False


def verdict(summary, cwd):
    turns = {t["n"]: t for t in summary.get("turns", [])}
    sid = summary.get("sessionId")
    checks = {
        "local_write": completed_write(turns.get(1, {}), "local", "local"),
        "cloud_write": completed_write(turns.get(3, {}), "cloud", "cloud"),
        "follow_up": turns.get(4, {}).get("text", "").strip() == "follow-up ok",
        "same_session": bool(sid) and len(turns) == 4 and all(
            t.get("sessionIds") == [sid] for t in turns.values()),
        "all_turns_completed": len(turns) == 4 and all(
            t.get("stopReason") == "end_turn" for t in turns.values()),
        "moved_to_cloud": "cloud" in turns.get(2, {}).get("computers", [])
        or "cloud" in turns.get(3, {}).get("computers", []),
    }
    try:
        checks["mac_copy_still_local"] = (Path(cwd) / "acp-check.txt").read_text().strip() == "local"
    except OSError:
        checks["mac_copy_still_local"] = False
    summary["checks"] = checks
    return "pass" if all(checks.values()) and not summary.get("error") else "fail"
