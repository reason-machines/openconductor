#!/usr/bin/env python3
"""Qualify retained inert source and the checked OpenConductor caller chain."""
import argparse
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[4]
PACKET = ROOT / "evidence/chat/composer/slash-atom-preservation/packet.json"
BASE = "bc2a476d70d0b731be243f0422d99013a96d39f3"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def between(text, start, end):
    begin = text.index(start)
    finish = text.index(end, begin) + len(end)
    return begin, finish, text[begin:finish]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    original = json.loads(PACKET.read_text())
    spans = {entry["symbol"]: entry for entry in original["spans"]}
    chosen = {name: spans[name] for name in ["ITo", "BNi", "eki+nce"]}
    for entry in chosen.values():
        raw = entry["compiled_javascript"].encode()
        assert sha(raw) == entry["sha256_utf8"]
        assert len(raw) == entry["utf8_bytes"][1] - entry["utf8_bytes"][0]
    ito = chosen["ITo"]["compiled_javascript"]
    fragments = []
    for name, start, end in [
        ("jI", "jI=$.useMemo(", "},[c1,$s,bt])"),
        ("slash selection", '{char:"/",query:z6', 'insertContentAt($r,`/${Vf} `).run()}}'),
    ]:
        lo, hi, text = between(ito, start, end)
        offset = chosen["ITo"]["utf8_bytes"][0]
        fragments.append({
            "name": name,
            "utf8_bytes": [offset + len(ito[:lo].encode()), offset + len(ito[:hi].encode())],
            "sha256_utf8": sha(text.encode()),
            "compiled_javascript": text,
        })
    for name in ["BNi", "eki+nce"]:
        entry = chosen[name]
        fragments.append({
            "name": name,
            "utf8_bytes": entry["utf8_bytes"],
            "sha256_utf8": entry["sha256_utf8"],
            "compiled_javascript": entry["compiled_javascript"],
        })
    originals = {entry["name"]: entry["compiled_javascript"] for entry in fragments}
    assert 'const Ns=`skill:${hr.name}|${nde(hr.path)}`' in originals["jI"]
    assert 'id:Ns,label:hr.displayName??hr.name' in originals["jI"]
    assert 'if(MNi(Ns)){BNi(ln,$r,hr);return}' in originals["slash selection"]
    assert 'id:n.id,label:n.label??n.id,char:"§"' in originals["BNi"]
    assert 'function nce' in originals["eki+nce"]
    paths = [
        "src/features/chat/slashCommands.ts",
        "src/features/chat/slashCompletions.ts",
        "src/features/chat/Composer.tsx",
        "src/features/chat/codexChat.ts",
        "src-tauri/src/agent/codex_rpc.rs",
    ]
    files = {}
    for path in paths:
        raw = subprocess.check_output(["git", "show", f"{BASE}:{path}"], cwd=ROOT)
        files[path] = {"sha256_utf8": sha(raw), "source": raw.decode()}
    assert 'insert: `${agent === "codex" ? "$" : "/"}${skill.name}`' in files[paths[0]]["source"]
    assert 'if (s.path.endsWith("SKILL.md") && !byName.has(s.name)) byName.set(s.name, s)' in files[paths[1]]["source"]
    assert 'box.replaceRange(range, `${command.insert ?? `/${command.name}`} `)' in files[paths[2]]["source"]
    assert 'text: linkCodexSkills(text, skills)' in files[paths[3]]["source"]
    assert 'let (text, skills) = skill_links(text)' in files[paths[4]]["source"]
    assert 'json!({ "type": "skill", "name": name, "path": path })' in files[paths[4]]["source"]
    result = {
        "author": "Conductor Rebuild",
        "main_sha_checked": BASE,
        "artifact": original["artifact"],
        "provenance": original["provenance"],
        "retained_packet_sha256": sha(PACKET.read_bytes()),
        "coordinate_units": "zero-based, end-exclusive UTF-8 bytes in the retained renderer",
        "original_fragments": fragments,
        "current_main_sha256": {path: item["sha256_utf8"] for path, item in files.items()},
        "assertions_passed": 17,
        "finding": "Original selection retains a name-and-path ID. Checked OpenConductor insertion loses the path; the send converter resolves a bare name to the first matching skill.",
        "design_choice": "Carry a picked Codex skill through the existing supported [$name](path/SKILL.md) prompt grammar. This is not a claim that Conductor uses that draft representation.",
        "limits": [
            "Retained source only, not target execution or semantic recovery.",
            "REA skipped renderer parsing after its worker exhausted the heap; exact compiled spans were inspected as inert data.",
            "No browser, server, native app, provider, pill visual, whitespace-path grammar, installed build, or deployment verification.",
        ],
    }
    pathlib.Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print("PASS: 17 source/hash assertions. Static qualification only.")


if __name__ == "__main__":
    main()
