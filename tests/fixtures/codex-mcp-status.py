#!/usr/bin/env python3
"""Synthetic app-server preparation, not an observed provider or a test result."""
import json
import os
import sys
import threading
import time

scenario = os.environ.get("OC_MCP_TEST_SCENARIO", "pages")
delay = int(os.environ.get("OC_MCP_TEST_DELAY_MS", "250")) / 1000
held_status = None
turn = 0
announced_turn = 0
seen_ids = set()
expected_cursor = None
output_lock = threading.Lock()


def emit(message):
    with output_lock:
        print(json.dumps(message), flush=True)


def announce_turn(number, body):
    global announced_turn
    with output_lock:
        print(json.dumps({"method": "turn/started", "params": {"threadId": "synthetic-thread", "turn": body}}), flush=True)
        announced_turn = number


def response(request_id, result):
    emit({"id": request_id, "result": result})


def rpc_error(request_id, message="Synthetic unsupported status request"):
    emit({"id": request_id, "error": {"code": -32601, "message": message}})


def complete_turn(status="completed"):
    emit({"method": "turn/completed", "params": {"threadId": "synthetic-thread", "turn": {"id": "synthetic-turn-" + str(turn), "items": [], "status": status}}})


def page(cursor):
    if scenario == "empty":
        return {"data": [], "nextCursor": None}
    row = {"name": "synthetic-server", "tools": {}, "authStatus": "notLoggedIn", "serverInfo": None}
    if cursor:
        row.update({"name": "synthetic-connected", "authStatus": "unknown", "tools": {"inspect": {"name": "inspect", "description": "Synthetic tool", "annotations": {"readOnly": True, "destructive": False, "openWorld": False}}}})
    variants = {
        "null-tool": lambda: row.update(tools={"inspect": None}),
        "null-description": lambda: row.update(tools={"inspect": {"name": "inspect", "description": None}}),
        "null-annotations": lambda: row.update(tools={"inspect": {"name": "inspect", "annotations": None}}),
        "invalid-annotation": lambda: row.update(tools={"inspect": {"name": "inspect", "annotations": {"readOnly": "yes"}}}),
        "invalid-server-info": lambda: row.update(serverInfo={"name": "synthetic"}),
        "unknown-auth": lambda: row.update(authStatus="synthetic-invalid"),
    }
    if scenario in variants:
        variants[scenario]()
    if scenario == "missing-server-info":
        del row["serverInfo"]
    next_cursor = "synthetic-next" if not cursor or scenario == "repeat" else None
    if scenario == "empty-cursor":
        next_cursor = ""
    result = {"data": [row], "nextCursor": next_cursor}
    if scenario == "missing-next-cursor":
        del result["nextCursor"]
    return result


for line in sys.stdin:
    request = json.loads(line)
    method = request.get("method")
    request_id = request.get("id")
    wire_log = os.environ.get("OC_MCP_TEST_WIRE_LOG")
    if wire_log:
        with open(wire_log, "a", encoding="utf-8") as target:
            target.write(json.dumps(request) + "\n")
    if method and "id" in request:
        if type(request_id) is not int or request_id in seen_ids:
            rpc_error(request_id, "Synthetic fixture requires unique integer request IDs")
            continue
        seen_ids.add(request_id)
    if method == "initialize":
        response(request_id, {"userAgent": "synthetic-status-fixture/2"})
    elif method in ("thread/start", "thread/resume"):
        response(request_id, {"thread": {"id": "synthetic-thread"}})
    elif method == "turn/start":
        turn += 1
        if held_status is not None and scenario == "hold-until-turn":
            response(held_status, {"data": [], "nextCursor": None})
            held_status = None
        body = {"id": "synthetic-turn-" + str(turn), "items": [], "status": "inProgress"}
        response(request_id, {"turn": body})
        if scenario == "pre-start":
            threading.Timer(delay, announce_turn, args=(turn, body)).start()
        else:
            announce_turn(turn, body)
        if scenario == "hold-until-turn" and turn == 1:
            complete_turn()
    elif method == "mcpServerStatus/list":
        expected = {} if expected_cursor is None else {"cursor": expected_cursor}
        if request.get("params") != expected:
            rpc_error(request_id, "Unexpected synthetic MCP pagination params")
            continue
        if scenario == "rpc-error":
            rpc_error(request_id)
        elif scenario == "close":
            break
        elif scenario == "broken-stdin":
            os.close(0)
            emit({"method": "synthetic/stdinClosed", "params": {}})
            time.sleep(delay)
            break
        elif scenario in ("timeout", "hold-until-interrupt", "hold-until-turn", "interrupt-close", "buffered-expired"):
            held_status = request_id
        elif scenario == "consent":
            held_status = request_id
            emit({"id": 9001, "method": "mcpServer/elicitation/request", "params": {"threadId": "synthetic-thread", "turnId": "synthetic-turn-" + str(turn), "serverName": "synthetic-server", "mode": "form", "message": "Synthetic consent", "requestedSchema": {"type": "object", "properties": {}}, "_meta": None}})
        elif scenario == "approval":
            held_status = request_id
            emit({"id": 9002, "method": "item/commandExecution/requestApproval", "params": {"threadId": "synthetic-thread", "turnId": "synthetic-turn-" + str(turn), "itemId": "synthetic-command", "command": "printf synthetic", "cwd": "/synthetic", "availableDecisions": ["accept", "cancel"]}})
        else:
            result = page(request.get("params", {}).get("cursor"))
            rejected_page = scenario in {"null-tool", "null-description", "null-annotations", "invalid-annotation", "invalid-server-info", "unknown-auth", "missing-server-info", "missing-next-cursor"}
            repeated_page = scenario == "repeat" and expected_cursor is not None
            expected_cursor = None if rejected_page or repeated_page else result.get("nextCursor") or None
            response(request_id, result)
    elif method == "turn/interrupt":
        with output_lock:
            announced = announced_turn == turn
        if scenario == "pre-start" and not announced:
            rpc_error(request_id, "Synthetic turn has not been announced")
            continue
        if scenario == "interrupt-close":
            break
        if held_status is not None and scenario in ("hold-until-interrupt", "buffered-expired"):
            response(held_status, {"data": [], "nextCursor": None})
            held_status = None
        if scenario == "buffered-expired":
            time.sleep(delay)
        response(request_id, {})
        complete_turn("interrupted")
    elif method is None and request_id in (9001, 9002):
        if held_status is not None:
            response(held_status, {"data": [], "nextCursor": None})
            held_status = None
