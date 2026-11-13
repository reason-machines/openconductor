"""Check source bytes and candidate composition without running product/reference JS."""
import argparse
import ast
import difflib
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def check():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fresh-main', action='store_true')
    args = parser.parse_args()
    record = json.loads((HERE / 'source.json').read_text())
    for span in record['reference_spans']:
        raw = (HERE / span['path']).read_bytes()
        assert len(raw) == span['bytes'] and sha(raw) == span['sha256'], span['path']
    namespace = {'__file__': str(HERE / 'prepare.py'), '__name__': 'source_composition'}
    exec(compile(ast.parse((HERE / 'prepare.py').read_text()), str(HERE / 'prepare.py'), 'exec'), namespace)
    baselines = {}
    candidates = {}
    for path, expected in record['baseline_sha256'].items():
        baseline = subprocess.check_output(['git', 'show', record['checked_main'] + ':' + path], cwd=ROOT)
        assert sha(baseline) == expected, path
        retained = HERE / 'baseline' / (path + '.txt')
        if retained.exists():
            assert retained.read_bytes() == baseline
        if args.fresh_main:
            actual = subprocess.check_output(['git', 'show', 'origin/main:' + path], cwd=ROOT)
            assert actual == baseline, 'Actual main drift: ' + path
        baselines[path] = baseline
        candidates[path] = namespace['product_candidate'](path, baseline)
        assert sha(candidates[path]) == record['candidate_sha256'][path], path
    binding = ROOT / record['protected_binding']['path']
    assert sha(binding.read_bytes()) == record['protected_binding']['sha256']
    protected = json.loads(binding.read_text())['immutable_files']
    assert len(protected) == record['protected_binding']['files']
    for path, expected in protected.items():
        assert sha((ROOT / path).read_bytes()) == expected, 'Protected input changed: ' + path
    page = 'src/settings/GeneralPage.tsx'
    before = (HERE / 'baseline' / (page + '.txt')).read_text()
    after = (HERE / 'candidate' / (page + '.txt')).read_text()
    follow = (ROOT / 'evidence/settings/follow-up-pending/composition/candidate/GeneralPage.tsx.txt').read_text()
    integrated = (HERE / 'integrated/GeneralPage.tsx.txt').read_text()
    assert sha(integrated.encode()) == record['composition']['integrated_general_page']
    assert namespace['sound_row'](before) == after
    assert namespace['sound_row'](follow) == integrated
    assert integrated[integrated.index('function SendKeyRow('):] == follow[follow.index('function SendKeyRow('):]
    for start, end in [('      <SendKeyRow', '      <Row\n        label="Follow-up behavior"'), ('      <Row\n        label="Follow-up behavior"', '      <Row label="Agent notifications"')]:
        assert integrated[integrated.index(start):integrated.index(end)] == follow[follow.index(start):follow.index(end)]
    patch = ''.join(''.join(difflib.unified_diff(baselines[path].decode().splitlines(keepends=True), candidates[path].decode().splitlines(keepends=True), fromfile='a/' + path, tofile='b/' + path)) for path in record['baseline_sha256'])
    assert (HERE / 'candidate.patch').read_text() == ''.join('\n' if line == ' \n' else line for line in patch.splitlines(keepends=True))
    for line in (HERE / 'frozen.sha256').read_text().splitlines():
        expected, path = line.split('  ', 1)
        assert sha((HERE / path).read_bytes()) == expected, path
    print(json.dumps({'source_integrity': 'PASS', 'reference_spans': len(record['reference_spans']), 'protected_inputs': len(protected), 'composition': 'PASS', 'behavior': 'NOT_RUN', 'native_parity': 'UNVERIFIED'}))


if __name__ == '__main__':
    check()
