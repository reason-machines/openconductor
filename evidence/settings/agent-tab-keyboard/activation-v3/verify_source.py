"""Check K1 activation against fresh source bytes without running product code."""
import argparse
import gzip
import hashlib
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACKET = HERE.parent
ROOT = PACKET.parents[2]
KIT = 'src/settings/agents/kit.tsx'
WORKFLOW = '.github/workflows/ci.yml'
WRAPPER = 'src/settings/agents/agentTabKeyboard.test.ts'
FIXTURE = 'evidence/settings/agent-tab-keyboard/agentTabsKeyboard.dom.test.mjs'
HUNK = re.compile(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n')


def git(*args):
    return subprocess.check_output(['git', '-c', 'gc.auto=0', *args], cwd=ROOT, timeout=15)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def project_patch(sources, patch):
    """Project this packet's unified diff into memory; never write source files."""
    projected = dict(sources)
    for block in re.split(r'(?=^--- )', patch, flags=re.MULTILINE):
        if not block:
            continue
        lines = block.splitlines(keepends=True)
        old, new = lines[0].removeprefix('--- ').strip(), lines[1].removeprefix('+++ ').strip()
        assert new.startswith('b/') and (old == '/dev/null' or old == 'a/' + new[2:])
        path = new[2:]
        assert not Path(path).is_absolute() and '..' not in Path(path).parts
        if old == '/dev/null':
            if path in projected:
                raise ValueError(f'new-file target already exists: {path}')
            before = []
        else:
            before = projected[path].decode().splitlines(keepends=True)
        output, cursor, index = [], 0, 2
        while index < len(lines):
            match = HUNK.fullmatch(lines[index])
            assert match, lines[index]
            old_start, old_count, new_start, new_count = match.groups()
            old_count = int(old_count) if old_count is not None else 1
            new_count = int(new_count) if new_count is not None else 1
            offset = int(old_start) - (1 if old_count else 0)
            assert cursor <= offset <= len(before)
            output.extend(before[cursor:offset])
            assert len(output) == int(new_start) - (1 if new_count else 0)
            index += 1
            removed, added = [], []
            while index < len(lines) and not lines[index].startswith('@@ '):
                line = lines[index]
                assert line[:1] in [' ', '-', '+'], line
                if line[0] != '+':
                    removed.append(line[1:])
                if line[0] != '-':
                    added.append(line[1:])
                index += 1
            assert len(removed) == old_count and len(added) == new_count
            assert before[offset:offset + old_count] == removed, path
            output.extend(added)
            cursor = offset + old_count
        projected[path] = ''.join(output + before[cursor:]).encode()
    return projected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--main', required=True, help='Freshly fetched full origin/main SHA')
    parser.add_argument('--phase', choices=['baseline', 'candidate'], default='baseline')
    args = parser.parse_args()
    assert re.fullmatch('[0-9a-f]{40}', args.main), 'Use a full immutable SHA'
    assert git('rev-parse', 'origin/main').decode().strip() == args.main, 'origin/main changed'
    assert git('branch', '--show-current').decode().strip() == 'reason/task-64baa6b6'
    git('merge-base', '--is-ancestor', '09b1c998acb093f4d905d5ef844c80136ea987f6', args.main)
    manifest = json.loads((PACKET / 'checkpoint.json').read_text())
    prior = json.loads((PACKET / 'historical/source-receipt-v1.json').read_text())
    for entry in manifest['files']:
        raw = (PACKET / entry['path']).read_bytes()
        assert digest(raw) == entry['sha256'] and len(raw) == entry['bytes'], entry['path']
    sources = {entry['path']: git('show', f"{args.main}:{entry['path']}") for entry in manifest['source_pins']}
    for entry in manifest['source_pins']:
        assert digest(sources[entry['path']]) == entry['sha256'], entry['path']
    sources[FIXTURE] = git('show', f'{args.main}:{FIXTURE}')
    assert digest(sources[FIXTURE]) == prior['fixture']['sha256']
    assert (ROOT / FIXTURE).read_bytes() == sources[FIXTURE]
    assert not (ROOT / WRAPPER).exists(), 'Discovery is already active; reconcile rather than overwrite'

    publication = (PACKET / 'publication.patch').read_text()
    fixture_header = f'--- /dev/null\n+++ b/{FIXTURE}\n'
    activation, fixture_hunk = publication.split(fixture_header)
    assert (HERE / 'activation.patch').read_text() == activation
    assert project_patch({}, fixture_header + fixture_hunk)[FIXTURE] == sources[FIXTURE]
    try:
        project_patch(sources, publication)
    except ValueError as error:
        assert str(error) == f'new-file target already exists: {FIXTURE}'
    else:
        raise AssertionError('Archived publication must reject the already-tracked fixture')
    projected = project_patch(sources, activation)
    assert {path for path in projected if projected[path] != sources.get(path)} == {WORKFLOW, WRAPPER}
    assert projected[WRAPPER] == (PACKET / 'agentTabKeyboard.test.ts.txt').read_bytes()
    assert projected[FIXTURE] == sources[FIXTURE]

    sealed_product = gzip.decompress((PACKET / 'product.patch.gz').read_bytes())
    assert digest(sealed_product) == prior['patch']['sha256']
    candidate = project_patch(sources, sealed_product.decode())
    assert {path for path in candidate if candidate[path] != sources[path]} == {KIT}
    expected_kit = next(entry['candidate_sha256'] for entry in prior['current_source_pins'] if entry['path'] == KIT)
    assert digest(candidate[KIT]) == expected_kit
    for path, baseline in sources.items():
        expected = candidate[KIT] if path == KIT and args.phase == 'candidate' else baseline
        assert (ROOT / path).read_bytes() == expected, path
    product_paths = ['src', 'src-tauri', 'crates', '.github', 'package.json', 'package-lock.json']
    assert git('diff', '--cached', '--name-only', '--', *product_paths) == b''
    changed = git('diff', args.main, '--name-only', '--', *product_paths).decode().splitlines()
    assert changed == ([KIT] if args.phase == 'candidate' else []), changed
    print(json.dumps({
        'author': 'Conductor Rebuild',
        'checked_main': args.main,
        'phase': args.phase,
        'source_pins': len(manifest['source_pins']),
        'archived_duplicate_fixture_rejection': 'PASS',
        'activation_source_projection': 'PASS',
        'sealed_product_source_projection': 'PASS',
        'frozen_fixture_sha256': digest(sources[FIXTURE]),
        'activation_sha256': digest(activation.encode()),
        'runtime_grant': False,
        'product_code_executed': False,
        'patches_applied_to_checkout_or_git_index': False,
        'behavioral_red_green': 'NOT_RUN_BY_THIS_CHECK',
    }, indent=2))


if __name__ == '__main__':
    main()
