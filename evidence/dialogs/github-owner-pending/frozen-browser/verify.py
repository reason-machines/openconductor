"""Audit frozen browser inputs and original readbacks, without starting a browser."""
import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sha = lambda b: hashlib.sha256(b).hexdigest()
bundle = json.loads((HERE.parent / "bundle.json").read_text())
assert [r["inputCount"] for r in bundle["records"]] == [186, 186]
base, treatment = bundle["records"]
assert base["inputs"].keys() == treatment["inputs"].keys()
assert [p for p in base["inputs"] if base["inputs"][p] != treatment["inputs"][p]] == ["src/components/GitHubRepoDialog.tsx"]
assert base["componentSha256"] == "31410cf1ead4ba45c055c74ebd64c90adf7c85c05db400deea989c06953c79f1"
assert treatment["componentSha256"] == "f9c5410cdaccbf1c767066358b676e5448d924d2c31d5374612f94559b79f336"
for name, digest in bundle["fixture"].items():
    assert sha((HERE / name).read_bytes()) == digest, name
for path, digest in treatment["inputs"].items():
    if path.startswith("src/"):
        assert sha((ROOT / path).read_bytes()) == digest, path
manifest = json.loads((HERE / "raw-readbacks-manifest.json").read_text())
packed = (HERE / manifest["file"]).read_bytes()
assert sha(packed) == manifest["gzip_sha256"]
raw = gzip.decompress(packed)
assert sha(raw) == manifest["raw_jsonl_sha256"]
rows = [json.loads(line) for line in raw.splitlines()]
assert len(rows) == manifest["records"] == 49
assert [r["source"] for r in rows] == manifest["sources"]
proof, flow = {}, {}
outputs = 0
for row in rows:
    meta, text = row["source"], row["raw"]
    assert sha(text.encode()) == meta["sha256"] and len(text) == meta["chars"]
    assert meta["tool"] == "browser_use"
    if meta["role"] != "tool_output":
        continue
    outputs += 1
    value = json.loads(json.loads(text)["result"]["result"]["value"])
    if value.get("tag") == "OWNERPROOF":
        key = (value["state"]["build"], value["control"])
        assert key not in proof
        proof[key] = value
    if value.get("tag") == "OWNERFLOW":
        assert value["stage"] not in flow
        flow[value["stage"]] = value
assert outputs == manifest["readbacks"] == 32
assert len(proof) == 12 and len(flow) == 5
request = lambda owner: {"owner": owner, "repoPath": "/synthetic/project", "repositoryName": "notes", "existingOriginUrl": "https://example.invalid/original.git"}
for version in ("baseline", "treatment"):
    for control in range(1, 7):
        value = proof[version, control]
        s = value["state"]
        if control == 1:
            passed = s["owner"] == "" and s["ownerDisabled"] is True and s["submitDisabled"] is True and s["requests"] == [] and s["checks"] == []
        elif control == 2:
            passed = s["owner"] == "team" and len(s["options"]) == 2 and s["requests"] == [request("team")]
        elif control == 3:
            passed = s["owner"] == "person" and s["ownerDisabled"] is False and s["submitDisabled"] is True and s["submit"] == "Creating..." and s["requests"] == [request("person")] and s["closes"] == 0
        elif control == 4 and version == "baseline":
            assert value["stage"] == "enablement prerequisite before any selection"
            assert s["requests"] == [request("person")]
            assert not any(e["type"] == "change" for e in s["events"])
            passed = s["ownerDisabled"] is False
        elif control == 4:
            passed = s["closes"] == 1 and s["dialog"] is False and s["added"] == ["https://example.invalid/team/notes.git"] and s["requests"] == [request("person"), request("team")] and s["errors"] == ["Synthetic creation rejected"]
        elif control == 5:
            passed = s["owner"] == "person" and s["ownerDisabled"] is False and s["submitDisabled"] is False and s["requests"] == [request("person")] and s["errors"] == ["Synthetic creation rejected"] and s["closes"] == 0
        else:
            passed = s["closes"] == 1 and s["dialog"] is False and s["added"] == ["https://example.invalid/person/notes.git"] and s["requests"] == [request("person")] and s["errors"] == []
        assert passed == value["pass"] == (version == "treatment" or control not in (3, 4)), (version, control)
        assert all(e["trusted"] is True for e in s["events"] if e["type"] in ("click", "submit"))
selected = flow["pending selection"]
assert selected["before"]["ownerDisabled"] is False and selected["before"]["owner"] == "person"
assert selected["before"]["requests"] == [request("person")] and selected["actualValue"] == "team"
for stage in ("new owner availability while first request pending", "disabled primary real pointer attempt"):
    s = flow[stage]["state"]
    assert flow[stage]["pass"] is True
    assert s["owner"] == "team" and s["ownerDisabled"] is False and s["submitDisabled"] is True
    assert s["requests"] == [request("person")] and s["checks"] == ["person/notes", "team/notes"] and s["closes"] == 0
s = flow["rejected first request keeps edited draft"]["state"]
assert s["owner"] == "team" and s["ownerDisabled"] is False and s["submitDisabled"] is False
assert s["requests"] == [request("person")] and s["errors"] == ["Synthetic creation rejected"] and s["closes"] == 0
s = flow["retry snapshot"]["state"]
assert s["requests"] == [request("person"), request("team")] and s["submitDisabled"] is True and s["closes"] == 0
cleanup = json.loads((HERE / "cleanup.json").read_text())
assert cleanup["released_at"] < cleanup["deadline"]
assert cleanup["owned_tabs"] == [] and cleanup["own_server_ps"] == []
assert cleanup["preview_state"] == "stopped" and cleanup["listening"] is None
assert cleanup["independent_port48733_bind"] == "PASS"
servers = json.loads((HERE / "cleanup-preview.json").read_text())["servers"]
assert all(s["state"] == "stopped" and s["listening"] is None for s in servers)
print(json.dumps({"result": "PASS", "inputs_each": 186, "only_input_difference": "GitHubRepoDialog", "raw_records": len(rows), "raw_readbacks": outputs, "baseline": "4/6; two intended pending-Owner failures", "treatment": "6/6", "intermediate_flow": "5 stages preserved", "cleanup": "released before deadline", "native_picker": "not exercised; select input/change synthetic"}))
