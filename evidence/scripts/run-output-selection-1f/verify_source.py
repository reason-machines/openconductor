"""Read-only checks for retained REA, baseline identities and sealed cases."""
import argparse
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original-dir', type=Path)
    args = parser.parse_args()
    receipt = json.loads((HERE / 'source.json').read_text())
    originals = {}
    if args.original_dir:
        for record in receipt['reference_assets']:
            data = (args.original_dir / record['name']).read_bytes()
            assert len(data) == record['bytes'] and digest(data) == record['sha256'], record['name']
            originals['renderer' if record['name'].startswith('renderApp-') else 'index'] = data
    for record in receipt['reference_spans']:
        name = record['symbol'].replace('$', '_') + '.txt'
        data = (HERE / 'reference' / name).read_bytes()
        assert len(data) == record['bytes'] and digest(data) == record['sha256'], name
        if originals:
            original = originals[record['asset']]
            start, end = record['utf8_half_open']
            assert original[start:end] == data and original.count(data) == 1, name
    for record in receipt['current_sources'][:3]:
        data = (HERE / 'baseline' / (Path(record['path']).name + '.txt')).read_bytes()
        assert len(data) == record['bytes'] and digest(data) == record['sha256'], record['path']
    frozen = json.loads((HERE / 'cases.json').read_text())
    data = (ROOT / frozen['path']).read_bytes()
    assert digest(data) == frozen['sha256'], 'Frozen Run selection fixture changed'
    change = json.loads((HERE / 'type-correction-v1/change.json').read_text())
    original = (HERE / 'type-correction-v1/runOutputSelection.test.ts.txt').read_bytes()
    assert digest(original) == change['original_fixture_sha256'] == frozen['original_publication_sha256']
    expected = original.decode()
    for edit in change['changes']:
        assert expected.count(edit['before']) == 1
        expected = expected.replace(edit['before'], edit['after'])
    boundary = json.loads((HERE / 'boundary-correction-v2/change.json').read_text())
    previous = (HERE / 'boundary-correction-v2/runOutputSelection.before.ts.txt').read_bytes()
    assert expected.encode() == previous
    assert digest(previous) == boundary['before_fixture_sha256'] == change['current_fixture_sha256']
    for edit in boundary['changes']:
        assert expected.count(edit['before']) == 1
        expected = expected.replace(edit['before'], edit['after'])
    assert expected.encode() == data and digest(data) == boundary['after_fixture_sha256']
    old_tail = original[original.index(b'\ntest('):]
    tail = data[data.index(b'\ntest('):]
    assert tail == old_tail and digest(tail) == frozen['scenario_tail_sha256']
    assert data.decode().count('\ntest(') == len(frozen['cases']) == 10
    for name in frozen['cases']:
        assert f'test({json.dumps(name)}' in data.decode(), name
    print(json.dumps({'reference_spans': len(receipt['reference_spans']),
                      'complete_originals_checked': len(originals), 'baseline_files': 3,
                      'frozen_cases': len(frozen['cases']), 'result': 'PASS',
                      'runtime_or_native_acceptance': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
