#!/usr/bin/env python3
"""Check the frozen attachment fixture and its current-main source binding."""
import hashlib
import json
from pathlib import Path
import subprocess

PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[3]
original = json.loads((PACKET / "source.json").read_text())
current = json.loads((PACKET / "requalification.json").read_text())


def digest(body):
    return hashlib.sha256(body).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


fixture = original["fixture"]
original_fixture = git("show", f"{current['original_fixture_commit']}:{fixture}")
assert digest(original_fixture) == original["fixture_sha256"], "original fixture"
loader_before = b'''const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return new Function(...Object.keys(ports), `${javascript}\\nreturn (${result});`)(...Object.values(ports));'''
loader_after = b'''const javascript = ts.transpileModule(`${source}\\nconst evaluated = (${result});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return new Function(...Object.keys(ports), `${javascript}\\nreturn evaluated;`)(...Object.values(ports));'''
assert original_fixture.count(loader_before) == 1, "original loader"
version_two = original_fixture.replace(loader_before, loader_after)
assert git("show", f"{current['version_two_commit']}:{fixture}") == version_two, "published version two"
assert digest(version_two) == current["version_two_sha256"], "version two fixture"
expected_fixture = version_two.replace(
    b"      session,\n      setAttachments: session.setAttachments,",
    b"      session,\n      chatId,\n      setAttachments: session.setAttachments,",
).replace(
    b"      current.flush(); original.flush();\n      return new ComposerDrafts(client).load(id);",
    b"      current.flush(); original.flush();\n      await drafts.load(id);\n      return new ComposerDrafts(client).load(id);",
)
assert expected_fixture != version_two, "fixture boundary changes"
assert (ROOT / fixture).read_bytes() == expected_fixture, "non-boundary fixture change"
scenario_start = b'for (const agent of ["claude", "reason"]'
assert expected_fixture.split(scenario_start, 1)[1] == original_fixture.split(scenario_start, 1)[1], "scenario bodies or assertions changed"
assert digest((ROOT / fixture).read_bytes()) == current["fixture_sha256"], fixture
assert set(current["production_sha256"]) == set(original["production_sha256"])
for path, expected in current["production_sha256"].items():
    baseline = git("show", f"{current['baseline_main']}:{path}")
    assert digest(baseline) == expected, ("baseline", path)
    assert (ROOT / path).read_bytes() == baseline, ("product changed", path)

allowed = {
    fixture,
    *(str(path.relative_to(ROOT)) for path in PACKET.iterdir() if path.is_file()),
}
changed = set(git("diff", "--name-only", current["baseline_main"]).decode().splitlines())
assert changed <= allowed, ("unexpected diff", sorted(changed - allowed))
assert current["fixture_cases"] == sum(len(group["cases"]) for group in original["groups"]) == 7
print(json.dumps({
    "result": "PASS",
    "baseline_main": current["baseline_main"],
    "fixture_sha256": current["fixture_sha256"],
    "original_fixture_sha256": original["fixture_sha256"],
    "fixture_delta": "loader, chatId binding and persistence queue fence only; all scenario bodies and assertions unchanged",
    "frozen_cases": current["fixture_cases"],
    "production_files": len(current["production_sha256"]),
    "diff_scope": "additive test and proof only",
    "behavior_typecheck_native_provider": "NOT_RUN",
}, indent=2))
