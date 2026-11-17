"""Freeze inert retained REA source and the pre-fix component/test. Never evaluate reference JS."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
renderer = Path(sys.argv[1]).read_bytes()
index = Path(sys.argv[2]).read_bytes()
assets = {
    "renderer": (renderer, "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"),
    "index": (index, "b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3"),
}
for body, expected in assets.values():
    assert hashlib.sha256(body).hexdigest() == expected
spans = [
    ("local-mount-Gls", "renderer", 2118911, 2120648),
    ("dialog-container-dbi", "renderer", 2028481, 2028894),
    ("dialog-wrapper-Im", "renderer", 1986046, 1988633),
    ("native-popup-Rde", "renderer", 1904644, 1905795),
    ("owners-producer-Aos", "renderer", 1981992, 1982600),
    ("owners-query-H3i-Ros", "renderer", 1983084, 1983474),
    ("dialog-was", "renderer", 2028894, 2035857),
    ("owner-disabled-consumer", "renderer", 2032360, 2032427),
    ("select-wrapper-ah", "renderer", 2020251, 2021023),
    ("select-root-Hos", "renderer", 1997469, 2002869),
    ("trigger-wrapper-Bf", "renderer", 2021044, 2022256),
    ("trigger-qos", "renderer", 2003040, 2004873),
    ("button-O6", "renderer", 592323, 593854),
    ("button-props-jLr", "renderer", 591756, 592120),
    ("native-Es", "renderer", 465319, 466387),
    ("item-Eas", "renderer", 2035898, 2035972),
    ("item-wrapper-Il", "renderer", 2026506, 2027417),
    ("item-ras", "renderer", 2014457, 2016593),
]
rows = []
for name, asset, start, end in spans:
    body = assets[asset][0][start:end]
    path = HERE / "reference" / f"{name}.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    assert not path.exists(), "a frozen source span must never be overwritten"
    path.write_bytes(body)
    rows.append({"name": name, "asset": asset, "utf8_half_open": [start, end], "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "path": str(path.relative_to(HERE))})
main = subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT).decode().strip()
paths = ["src/components/GitHubRepoDialog.tsx", "src/components/githubRepoPendingOwner.test.ts"]
locks = []
for source in paths:
    body = (ROOT / source).read_bytes()
    if source.endswith("GitHubRepoDialog.tsx"):
        assert body == subprocess.check_output(["git", "show", f"{main}:{source}"], cwd=ROOT)
    target = HERE / "baseline" / (Path(source).name + ".txt")
    target.parent.mkdir(parents=True, exist_ok=True)
    assert not target.exists(), "a frozen baseline must never be overwritten"
    target.write_bytes(body)
    locks.append({"path": source, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "snapshot": str(target.relative_to(HERE))})
packet = {
    "author": "Conductor Rebuild", "main": main,
    "scope": "Owner editability during a pending creation only; source/component evidence, not native acceptance",
    "rea_receipt": "ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2",
    "assets": {name: {"bytes": len(body), "sha256": digest} for name, (body, digest) in assets.items()},
    "spans": rows, "frozen": locks,
    "reference_rule": "was uses owners-query isLoading (_) for ah.disabled; mutation c.isPending only guards the primary action. ah/Hos/qos/O6 forward disabled to the native trigger; Eas/Il/ras/Hos.onValueChange/was.I forward owner selection.",
    "current_counterexample": "After two owners load and creation starts, current Owner is disabled solely by pending. Reference Owner remains enabled. First request has already captured its scalar owner.",
    "proposed_change": "GitHubRepoDialog.tsx only: disabled={!ready || pending} -> disabled={!ready}",
    "controls": [
        "Initial loading: current disabled and submit blocked, unchanged.",
        "Idle ready: selection updates availability and the next creation owner.",
        "Pending: loaded Owner remains enabled; captured first request is unchanged and duplicate submits stay blocked.",
        "Rejected create: draft owner retained; after availability the retry captures that owner.",
        "Resolved create: existing remote callback and one close remain unchanged.",
        "Cached-query background refetch is characterized statically only. The runtime retry control covers orgsError refetch, not cached-query parity; existing OwnersState loading gate is unchanged.",
        "Owner query error: existing !ready and empty-owner guards unchanged. Not a claim of whole error-state parity.",
    ],
    "frozen_test_count": 9,
    "expected_red": ["Owner stays enabled while creation is pending", "pending Owner edits preserve the captured request and rejection draft through retry"],
    "expected_other_controls": "7 pass before and after; all 9 pass after the single expression change",
    "ports": "Actual GitHubRepoDialog and state model; outer DialogFrame and backend APIs are synthetic. No provider-backed filesystem, authentication, network or native operation; source files are read locally.",
    "limits": "Retained original source only; current installed Conductor identity, live original, visual, full-App, native, real-provider and packaged inclusion not verified. Original REA semantic renderer analysis exhausted heap; these hashed literal bytes supplement it and are never executed.",
}
(HERE / "source.json").write_text(json.dumps(packet, indent=2) + "\n")
print(json.dumps({"main": main, "retained_spans": len(rows), "frozen": locks, "expected_red": packet["expected_red"]}, indent=2))
