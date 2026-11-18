"""Source preparation only: immutable original-byte oracle, baseline, fixture and RED request.
Never imports/evaluates reference JS or product code, never reads a retained cache.
"""
from pathlib import Path
import argparse
import ast
import hashlib
import json
import subprocess
import tarfile

ROOT = Path.cwd()
HERE = ROOT / 'evidence/terminal/center-panel-close-history'
STATE = ROOT / '.oc-tmp/center-close-history-1f'
MAIN = '234ec70ea89135b83f68f287330a3701d27f2b2d'
sha = lambda data: hashlib.sha256(data).hexdigest()


def pin(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': sha(data)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    archive_path = parser.parse_args().archive
    assert not STATE.exists(), 'new source packet already exists; do not rewrite frozen input'
    assert subprocess.check_output(['git', 'rev-parse', 'origin/main'], text=True).strip() == MAIN
    assert sha(archive_path.read_bytes()) == '991f15ebf130ccb8e705fc74f612dbb46095bd6d73b420fbced1ffbcd94165bc'
    spans = [
        ('renderer', 'hFt', 2160258, 2160912),
        ('renderer', 'g8i', 7431219, 7436271),
        ('renderer', 'aYo', 9711369, 9712495),
        ('renderer', 'd8i', 7421915, 7422947),
        ('renderer', 'dYo-fYo', 9716664, 9723107),
        ('renderer', 'pYo', 9723455, 9725847),
        ('renderer', 'JKo', 9704882, 9707001),
        ('renderer', 'XKo-Nji', 9701429, 9704882),
        ('renderer', 'd1e', 6929046, 6930321),
        ('index', 'local-host', 2439, 2625),
        ('index', 'Gr-zc', 2803517, 2805969),
        ('index', 'Ps-sFt', 3121822, 3127670),
    ]
    parent = json.loads((ROOT / 'evidence/terminal/center-panel-split-1f/qualification.json').read_bytes())
    with tarfile.open(archive_path) as archive:
        assets = {key: archive.extractfile('glob-result-source-packet/retained-reference/' + filename).read() for key, filename in [('renderer', 'renderApp-D_fmY7hW.js'), ('index', 'index-BGEQ8YjU.js')]}
    for name, data in assets.items():
        assert len(data) == parent['assets'][name]['bytes'] and sha(data) == parent['assets'][name]['sha256']
    records = []
    reference = HERE / 'reference'
    reference.mkdir(exist_ok=False)
    for record in parent['spans']:
        data = assets[record['asset']][slice(*record['utf8_half_open'])]
        assert len(data) == record['bytes'] and sha(data) == record['sha256']
        records.append({**record, 'existing_path': 'evidence/terminal/center-panel-split-1f/' + record['file']})
    for asset, name, start, end in spans:
        data = assets[asset][start:end]
        path = reference / (name + '.txt')
        path.write_bytes(data)
        records.append({'asset': asset, 'name': name, 'utf8_half_open': [start, end], **pin(path)})
    consumer = (ROOT / 'evidence/terminal/center-panel-split-1f/spans/consumer-yYo.txt').read_text()
    assert 'au.removeViewedCenterPanelTab' in consumer and 'au.getCenterPanelTabViewHistory' in consumer
    assert 'Q({groupId:he,tab:ge}),q3.destroyTerminal' in consumer
    products = ['src/features/workspace/centerPanelLayout.ts', 'src/features/workspace/CenterPanelGroups.tsx', 'src/components/WorkspaceView.tsx', 'src/features/terminal/shellIntegration.ts']
    STATE.mkdir(parents=True)
    baseline = STATE / 'baseline'
    for path in products + ['package.json', 'package-lock.json']:
        original = subprocess.check_output(['git', 'show', MAIN + ':' + path])
        assert original == (ROOT / path).read_bytes(), path + ' differs from fresh main'
        target = baseline / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(original)
    permanent = ROOT / 'src/features/workspace/centerPanelCloseHistory.test.ts'
    frozen = STATE / 'frozen/centerPanelCloseHistory.test.ts'
    frozen.parent.mkdir()
    frozen.write_bytes(permanent.read_bytes())
    oracle = {
        'author': 'Conductor Rebuild', 'phase': 'SOURCE_FROZEN_NOT_RUN', 'main': MAIN,
        'rea_parent': parent['rea_evidence_id'], 'assets': parent['assets'], 'archive_sha256': sha(archive_path.read_bytes()),
        'reference_records': records,
        'ordinary_caller': 'enabled writable local grouped center terminal; visible d8i → yYo.te → Q before destruction',
        'counterexample': {'groups': [['chat', 'terminal:A'], ['terminal:B'], ['terminal:C']], 'view_order': ['chat', 'terminal:C', 'terminal:B'], 'close': 'terminal:B', 'expected': 'terminal:C', 'current_source_fallback': 'chat'},
        'test_contracts': ['MRU across groups', 'stale closed skip', 'workspace isolation', 'empty structural fallback', 'inactive preserve', 'ordinary false unchanged', 'ordinary unset unchanged', 'history not persisted'],
        'expected_original_red': {'semantic_failures': [1, 2], 'controls': [3, 4, 5, 6, 7, 8], 'setup_failure_is_not_semantic_red': True},
        'non_goals': ['native/DOM focus', 'physical pointer propagation', 'PTY/process termination', 'keyboard close', 'other tab kinds', 'right-panel close', 'provider', 'old cache preservation or RED9'],
        'product_applied': False, 'runtime_executed': False,
    }
    (HERE / 'oracle.json').write_text(json.dumps(oracle, indent=2) + '\n')
    supervisor = HERE / 'red-supervisor.py'
    ast.parse(supervisor.read_text())
    ast.parse(Path(__file__).read_text())
    paths = [permanent, frozen, ROOT / 'package.json', ROOT / 'package-lock.json', HERE / 'oracle.json', HERE / 'README.md']
    paths += [ROOT / path for path in products]
    paths += [path for path in baseline.rglob('*') if path.is_file()]
    paths += [path for path in reference.iterdir() if path.is_file()]
    paths += [ROOT / record['existing_path'] for record in records if 'existing_path' in record]
    request = {
        'author': 'Conductor Rebuild', 'phase': 'GROUPED_CENTER_CLOSE_ORIGINAL_RED_ONLY',
        'main': MAIN, 'supervisor_sha256': sha(supervisor.read_bytes()),
        'command': ['node', '--experimental-strip-types', '--test', '--test-concurrency=1', str(frozen.relative_to(ROOT))],
        'outer_command': 'taskset -c 0 nice -n 10 timeout --signal=TERM --kill-after=5s 80s env UV_THREADPOOL_SIZE=1 NODE_OPTIONS=--max-old-space-size=768 SAME1F_GROUPED_CLOSE_RED_ADMISSION=<separate-exact-admission> python3 evidence/terminal/center-panel-close-history/red-supervisor.py',
        'source_env': {'OC_GROUPED_CLOSE_SOURCE_ROOT': str(baseline.relative_to(ROOT)), 'OC_GROUPED_CLOSE_DEPENDENCY_ROOT': '.'},
        'expected_packages': {'react': '18.3.1', 'react-test-renderer': '18.3.1', 'typescript': '5.9.3'},
        'dependency_scope': 'Existing own node_modules only after separate admission explicitly permits this new unit; no install, rescan or historical preservation claim.',
        'product_paths': products, 'pins': [pin(path) for path in paths],
        'not_admitted': ['Node', 'tests', 'product delta', 'install', 'cache operations', 'old RED9', 'browser/native/provider/PTY', 'cleanup'],
    }
    (HERE / 'red-request.json').write_text(json.dumps(request, indent=2) + '\n')
    print(json.dumps({'status': 'SOURCE_PREPARED_NOT_RUN', 'pins': len(paths), 'original_reference_records': len(records), 'fixture': pin(permanent), 'frozen_byte_identity': permanent.read_bytes() == frozen.read_bytes(), 'request': pin(HERE / 'red-request.json'), 'supervisor': pin(supervisor)}, indent=2))


if __name__ == '__main__':
    main()
