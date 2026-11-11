from argparse import ArgumentParser
from pathlib import Path
import hashlib
import json
import subprocess
import tarfile

ARCHIVE_SHA = "f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084"
ASSET_SHA = "5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde"
MEMBER = ".rea-work/retained-reference/renderApp-D_fmY7hW.js"
NAMES = {"Home-UJo", "Home-command-root-KV", "command-root-Xyi"}


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def main():
    parser = ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--main", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    archive = args.archive.read_bytes()
    assert sha(archive) == ARCHIVE_SHA, "Original source-closure archive changed"
    with tarfile.open(args.archive) as packed:
        member = packed.getmember(MEMBER)
        assert member.isfile(), "Renderer member is not a regular file"
        binary = packed.extractfile(member).read()
    assert len(binary) == 11600457 and sha(binary) == ASSET_SHA
    retained = json.loads(Path("evidence/home-filter-selection/source.json").read_text())
    utf16 = binary.decode("utf-8").encode("utf-16-le")
    spans = []
    for entry in retained["spans"]:
        if entry["name"] not in NAMES:
            continue
        start, end = entry["utf8_half_open"]
        payload = binary[start:end]
        assert len(payload) == entry["bytes"] and sha(payload) == entry["sha256"]
        start16, end16 = entry["utf16_half_open"]
        assert utf16[start16 * 2:end16 * 2].decode("utf-16-le") == payload.decode()
        spans.append({**entry, "source": payload.decode()})
    assert len(spans) == len(NAMES)
    source = {entry["name"]: entry["source"] for entry in spans}
    assert "p.jsxs(KV,{shouldFilter:!1,disablePointerSelection:!0" in source["Home-UJo"]
    assert "p.jsx(P6,{" in source["Home-command-root-KV"]
    root = source["command-root-Xyi"]
    assert 'ce.nativeEvent.isComposing||ce.keyCode===229' in root
    assert 'if(!(ce.defaultPrevented||de))switch(ce.key)' in root
    assert 'case"Enter":{ce.preventDefault();let ue=G();if(ue)' in root
    main_sha = subprocess.check_output(["git", "rev-parse", args.main], text=True).strip()
    product = subprocess.check_output(["git", "show", f"{main_sha}:src/components/AllWorkspaces.tsx"])
    handler = product.decode().split("const onSearchKey = ", 1)[1].split("const toggleHint", 1)[0]
    assert handler.index("if (flat.length === 0) return;") < handler.index('e.key === "Enter"')
    assert 'e.preventDefault();' in handler.split('e.key === "Enter"', 1)[1]
    receipt = {
        "unit": "HOME-EMPTY-ENTER-271-04",
        "producer": "Conductor Rebuild",
        "status": "SOURCE_MISMATCH_ONLY",
        "main": main_sha,
        "main_component_sha256": sha(product),
        "main_handler": handler,
        "archive_sha256": ARCHIVE_SHA,
        "asset": {"member": MEMBER, "bytes": len(binary), "sha256": ASSET_SHA},
        "rea_parent_evidence": "ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367",
        "spans": spans,
        "finding": "Retained shipped command root cancels non-composing Enter before checking for a selected item. Current main returns before cancellation when the Home list is empty.",
        "dependency": "HOME-KEYBOARD-271-03 / PR1052 owns AllWorkspaces.onSearchKey. No concurrent product edit. Recheck containing main after that lease releases.",
        "proposed_regression": [
            "A real mounted AllWorkspaces with no rows cancels Enter and dispatches no workspace activation.",
            "A populated real component filtered to no matching rows cancels Enter without activation.",
            "Nonempty Enter retains selected-row activation and cancellation as a passing control.",
            "An unrelated character key on the empty list remains uncancelled as a passing control."
        ],
        "scope": "Enter cancellation with an empty list only. Do not broaden to IME, alternate navigation, Home/End or other keys.",
        "behavioral_red_green": "NOT_RUN",
        "visual_native_parity": "NOT_RUN",
        "limits": [
            "Static retained-REA evidence, not a runtime observation of Conductor.",
            "Existing REA semantic heap-exhaustion limitation unchanged.",
            "No Node, app, browser, native, hosted dispatch/rerun or E1 admission.",
            "Frozen header8, Prefix9, Home-list six cases and Home/End seven cases are unchanged."
        ]
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(receipt, indent=2) + "\n")
    assert sha(args.archive.read_bytes()) == ARCHIVE_SHA
    print(json.dumps({"status": receipt["status"], "main": main_sha, "verified_spans": len(spans), "packet": str(args.out), "packet_sha256": sha(args.out.read_bytes()), "behavior": "NOT_RUN"}))


if __name__ == "__main__":
    main()
