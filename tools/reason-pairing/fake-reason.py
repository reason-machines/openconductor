#!/usr/bin/env python3
"""Loopback-only Reason login fixture. Never contacts Reason or stores credentials."""
import json
import os
import sys
import time
import subprocess
import urllib.parse
import urllib.request

origin = os.environ.get("OC_PAIRING_FIXTURE_ORIGIN", "")
parsed = urllib.parse.urlsplit(origin)
if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not parsed.port or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
    sys.exit("OC_PAIRING_FIXTURE_ORIGIN must be a loopback HTTP origin")
client = os.environ.get("OC_PAIRING_FIXTURE_CLIENT", "")
if not client or any(not (c.isascii() and (c.isalnum() or c == "-")) for c in client):
    sys.exit("Missing isolated fixture client")
transport = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def request(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(origin + path, data=data, headers={"Content-Type": "application/json"})
    with transport.open(req, timeout=35 if path.endswith("/login") else 5) as response:
        return json.load(response)


args = sys.argv[1:]
workspace = None
if args[:1] == ["--workspace"] and len(args) >= 3:
    workspace, args = args[1], args[2:]
prefix = "/clients/" + client
if args[:1] == ["__fixture_finish"] and len(args) == 2:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            state = request("/pairings/" + args[1] + "/poll", {})["state"]
        except Exception:
            break
        if state != "pending":
            break
        time.sleep(0.08)
    sys.exit(0)
if args == ["status", "--json"]:
    print(json.dumps(request(prefix + "/status")))
elif args == ["login"]:
    delay = int(os.environ.get("OC_PAIRING_FIXTURE_LOGIN_DELAY_MS", "0"))
    pairing = request(prefix + "/login", {"workspace": workspace, "responseDelayMs": delay})
    if pairing["state"] != "connected":
        pairing = request("/pairings/" + pairing["id"] + "/poll", {})
    if pairing["state"] == "connected":
        print("Signed in to Reason as " + pairing["account"]["account"]["email"])
    elif pairing["state"] in ("cancelled", "expired"):
        sys.exit("Fixture pairing " + pairing["state"])
    else:
        subprocess.Popen([sys.executable, os.path.abspath(__file__), "__fixture_finish", pairing["id"]], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        print("Open this link to sign in to Reason: " + pairing["url"], flush=True)
        print("The page shows the code " + pairing["code"] + ".", flush=True)
        print("It finishes on its own once you have; run `reason login` again any time to see where it stands.", flush=True)
elif args == ["logout"]:
    request(prefix + "/logout", {})
    print("Signed out of the local fixture")
else:
    sys.exit("Unsupported fake Reason invocation: " + " ".join(args))
