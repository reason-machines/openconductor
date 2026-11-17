#!/usr/bin/env python3
"""Verify inert retained REA data and frozen fixture. Never evaluate vendor JS."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
packet = Path(__file__).resolve().parent
manifest = json.loads((packet / "source.json").read_text())
texts = {}
for span in manifest["spans"]:
    data = (root / span["path"]).read_bytes()
    assert len(data) == span["bytes"], span["name"]
    assert hashlib.sha256(data).hexdigest() == span["sha256"], span["name"]
    if "utf8_half_open" in span:
        start, end = span["utf8_half_open"]
        assert end - start == len(data), span["name"]
    texts[span["name"]] = data.decode()
for join in manifest["joins"]:
    assert join["literal"] in texts[join["span"]], join
fixture = root / manifest["fixture"]["path"]
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == manifest["fixture"]["sha256"]
print(f'PASS: {len(texts)} retained spans / {sum(s["bytes"] for s in manifest["spans"])} bytes; {len(manifest["joins"])} literal joins; frozen fixture')
