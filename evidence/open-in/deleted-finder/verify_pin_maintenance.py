import hashlib
import json
import runpy
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
manifest_path = 'evidence/diff/moved-comment-anchors/source.json'
product_path = 'src/features/diff/FileDiffView.tsx'
old_hash = '8e3dc981b01b2e5f8b19f51e1fd0e7c05691f2174d2d37b1fe7faf9455ecc6da'
new_hash = '19a71f293858aac215a762b2ca4f553150f93a2caa96d0d9d5404676b808b974'


def sha(data):
    return hashlib.sha256(data).hexdigest()


before = (HERE / 'previous-pins/moved-comment-anchors.json').read_bytes()
after = (ROOT / manifest_path).read_bytes()
manifest = json.loads(after)
product = (ROOT / product_path).read_bytes()
main_product = subprocess.check_output(['git', 'show', f'bb717dad2e1c4cbcbdba3d29d607a76a069f7f85:{product_path}'], cwd=ROOT)
checks = {
    'previous-complete-manifest': sha(before) == 'ab2c033d03f71b39bb8916528ee5ea2a110156544b1aa89b8b375a2c8d0b2431',
    'only-one-exact-candidate-field-changed': before.count(old_hash.encode()) == 1 and after == before.replace(old_hash.encode(), new_hash.encode()),
    'current-product-identity': sha(product) == new_hash,
    'main-product-identity': sha(main_product) == old_hash,
    'only-deleted-caller-prop-changed': product.count(b' deleted={file.status === "deleted"}') == 1 and product.replace(b' deleted={file.status === "deleted"}', b'', 1) == main_product,
}
for path, hashes in manifest['product'].items():
    baseline = subprocess.check_output(['git', 'show', f'{manifest["baseline"]}:{path}'], cwd=ROOT)
    checks[f'paired-baseline-identity:{path}'] = sha(baseline) == hashes['baseline']
    checks[f'paired-candidate-identity:{path}'] = sha((ROOT / path).read_bytes()) == hashes['candidate']
for path in [
    'evidence/diff/moved-comment-anchors/run-paired.py',
    'src/features/diff/movedCommentAnchors.test.ts',
    '.github/workflows/diff.yml',
    '.github/workflows/diff-moved-comment-anchors.yml',
]:
    checks[f'unchanged:{path}'] = (ROOT / path).read_bytes() == subprocess.check_output(['git', 'show', f'bb717dad2e1c4cbcbdba3d29d607a76a069f7f85:{path}'], cwd=ROOT)
hidden_path = "evidence/diff/hidden-whitespace-editing/execution-source-manifest.json"
hidden_before = (HERE / "previous-pins/hidden-whitespace-execution-source-manifest.json").read_bytes()
hidden_after = (ROOT / hidden_path).read_bytes()
checks["previous-complete-hidden-manifest"] = sha(hidden_before) == "adad3a1a8d5cf13586ecf3dd2f70683f86099f71b4618cbddeb7678838d72a9e"
checks["only-hidden-candidate-scalar-changed"] = hidden_before.count(old_hash.encode()) == 1 and hidden_after == hidden_before.replace(old_hash.encode(), new_hash.encode())
checks["hidden-candidate-field-is-current-product"] = json.loads(hidden_after)["files"]["candidate/" + product_path] == sha(product)
hidden_runner = runpy.run_path(str(ROOT / "evidence/diff/hidden-whitespace-editing/run-paired.py"))
hidden_runner["source_inputs"]()
checks["original-hidden-source-preflight-passes"] = True
for path in [
    "evidence/diff/hidden-whitespace-editing/run-paired.py",
    "src/features/diff/hiddenWhitespaceEditing.test.ts",
    ".github/workflows/diff-hidden-whitespace.yml",
]:
    checks[f"unchanged:{path}"] = (ROOT / path).read_bytes() == subprocess.check_output(["git", "show", f"bb717dad2e1c4cbcbdba3d29d607a76a069f7f85:{path}"], cwd=ROOT)
failed = [name for name, passed in checks.items() if not passed]
print(json.dumps({'checks': len(checks), 'passed': sum(checks.values()), 'failed': failed, 'paired_behavior': 'NOT_RUN', 'claim': 'Candidate identity preflight only; baseline, fixture, runner and workflow preserved.'}))
if failed:
    raise SystemExit(1)
