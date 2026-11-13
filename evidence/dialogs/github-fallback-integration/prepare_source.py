#!/usr/bin/env python3
"""Prepare an inert publication patch without checking out or executing product code."""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
PACKETS = REPO / "evidence/dialogs"
HELPER = "src/state/githubRepoDialog.ts"
STATE_TEST = "src/state/githubRepoDialog.test.ts"
PACKET_NAMES = ("github-owner-fallback-source", "github-orgs-fallback-source")
DERIVATIVES = (
    ("ownersErrorFallback.test.ts", "src/state/githubOwnerErrorFallback.test.ts"),
    ("orgsErrorFallback.test.ts", "src/state/githubOrgsErrorFallback.test.ts"),
)


def git(*args, **kwargs):
    return subprocess.check_output(["git", *args], cwd=REPO, **kwargs)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def replace_once(source, before, after):
    if source.count(before) != 1:
        raise ValueError(f"Source boundary changed: {before!r}")
    return source.replace(before, after, 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="origin/main")
    args = parser.parse_args()
    base = git("rev-parse", "--verify", f"{args.base}^{{commit}}").decode().strip()
    records = []
    sources = {}
    derivatives = {}
    fixtures = []
    for name, (fixture_name, target) in zip(PACKET_NAMES, DERIVATIVES):
        packet = PACKETS / name
        identity = json.loads((packet / "packet-identity.json").read_text())
        reference = json.loads((packet / "reference.json").read_text())
        assert identity["executed_cases"] == 0
        for item in identity["files"]:
            data = (packet / item["path"]).read_bytes()
            assert len(data) == item["bytes"] and sha(data) == item["sha256"], item["path"]
        for item in reference["spans"]:
            data = (packet / item["path"]).read_bytes()
            assert len(data) == item["utf8_half_open"][1] - item["utf8_half_open"][0]
            assert sha(data) == item["sha256"], item["path"]
        for item in reference["current_source"]:
            data = git("show", f"{base}:{item['path']}")
            assert sha(data) == item["sha256"], f"Requalify changed source: {item['path']}"
            sources[item["path"]] = data
        frozen = (packet / fixture_name).read_text()
        old_import = '../../../src/state/githubRepoDialog.ts'
        derived = replace_once(frozen, old_import, './githubRepoDialog.ts')
        assert derived.replace('./githubRepoDialog.ts', old_import, 1) == frozen
        assert git("ls-tree", "--name-only", base, "--", target) == b"", target
        derivatives[target] = derived
        fixtures.append({"original": str((packet / fixture_name).relative_to(REPO)),
                         "original_sha256": sha(frozen.encode()), "target": target,
                         "derived_sha256": sha(derived.encode()), "cases": identity["cases"],
                         "changes": "Import path only; all assertions and case data unchanged."})
        records.append({"directory": name, "identity_sha256": sha((packet / 'packet-identity.json').read_bytes()),
                        "cases": identity["cases"], "total_seconds_proposed": 60,
                        "per_invocation_seconds_proposed": 20, "runtime_admission": False})

    state_test = git("show", f"{base}:{STATE_TEST}")
    sources[STATE_TEST] = state_test
    helper = sources[HELPER].decode()
    owners_before = '  return `Couldn\'t load GitHub owners: ${detail}`;'
    owners_after = '  return "Couldn\'t load your GitHub accounts.";'
    orgs_before = '  return "Couldn\'t load your organizations. You can still use your personal account.";'
    orgs_after = '  return "Couldn\'t load your GitHub organizations. You can still use your personal account.";'
    final_helper = replace_once(replace_once(helper, owners_before, owners_after), orgs_before, orgs_after)
    assert final_helper == replace_once(replace_once(helper, orgs_before, orgs_after), owners_before, owners_after)
    old_assertion = '  assert.equal(ownersErrorMessage("timeout"), "Couldn\'t load GitHub owners: timeout");'
    new_assertion = '  assert.equal(ownersErrorMessage("timeout"), "Couldn\'t load your GitHub accounts.");'
    final_test = replace_once(state_test.decode(), old_assertion, new_assertion)
    after = {HELPER: final_helper, STATE_TEST: final_test, **derivatives}
    patch = ''.join(''.join(difflib.unified_diff(
        sources.get(path, b'').decode().splitlines(keepends=True), text.splitlines(keepends=True),
        fromfile=f'a/{path}' if path in sources else '/dev/null', tofile=f'b/{path}', n=1))
        for path, text in after.items())
    with tempfile.TemporaryDirectory(prefix="oc-github-fallback-source-") as tmp:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(tmp) / "index")}
        git("read-tree", base, env=env)
        subprocess.run(["git", "apply", "--cached", "--check", "-"], input=patch.encode(),
                       cwd=REPO, env=env, check=True)

    protected_file = REPO / "artifacts/github-orgs-fallback-6013/protected-input-receipt.json"
    protected = json.loads(protected_file.read_text())["checks"]
    for item in protected:
        assert sha((REPO / item["path"]).read_bytes()) == item["sha256"], item["path"]
    manifest = {"author": "Conductor Rebuild", "base": base, "state": "SOURCE_ONLY_UNAPPLIED",
                "packets": records, "fixtures": fixtures,
                "source": [{"path": path, "sha256": sha(data)} for path, data in sorted(sources.items())],
                "patch_sha256": sha(patch.encode()), "product_paths": list(after),
                "protected_inputs": protected, "source_applicability": "PASS_DETACHED_INDEX_CHECK_ONLY",
                "baseline_behavior": "NOT_RUN", "candidate_behavior": "NOT_RUN",
                "typecheck_build_browser_native": "NOT_RUN"}
    for path, text in derivatives.items():
        dest = OUT / "derived" / Path(path).name
        dest.parent.mkdir(exist_ok=True)
        dest.write_text(text)
    (OUT / "publication.patch").write_text(patch)
    (OUT / "source-integration.json").write_text(json.dumps(manifest, indent=2) + '\n')
    print(f"PASS source preparation at {base}: two literal returns, one derivative assertion, import-only copies of frozen 8 and 3. Product and behavioral execution: NOT_RUN.")


if __name__ == "__main__":
    main()
