#!/usr/bin/env python3
"""Check retained Conductor source and frozen cases without executing JavaScript."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original-dir', type=Path)
    args = parser.parse_args()
    record = json.loads((HERE / 'source.json').read_text())
    assets = {}
    if args.original_dir:
        for item in record['artifacts']:
            data = (args.original_dir / item['name']).read_bytes()
            assert sha(data) == item['sha256'] and len(data) == item['bytes'], item['name']
            assets['index' if item['name'].startswith('index-') else 'renderer'] = data
    spans = {}
    for item in record['spans']:
        data = (ROOT / item['path']).read_bytes()
        assert sha(data) == item['sha256'] and len(data) == item['bytes'], item['name']
        if assets:
            start, end = item['utf8_half_open']
            assert assets[item['name'].split('-')[0]][start:end] == data, item['name']
        spans[item['name']] = data
    for name, item in record['chain_checks'].items():
        assert item['token'].encode() in spans[item['span']], name
    frozen = (HERE / 'frozen-sessionUnicode.test.ts.txt').read_bytes()
    assert sha(frozen) == record['fixture_sha256']
    assert frozen == (ROOT / 'src/features/terminal/sessionUnicode.test.ts').read_bytes()
    assert sha((HERE / 'baseline-session.ts.txt').read_bytes()) == record['baseline_product_sha256']
    for item in record.get('compatibility_fixtures', []):
        data = (ROOT / item['path']).read_bytes()
        assert sha(data[data.index(b'test('):]) == item['test_bodies_sha256'], item['path']
    print(json.dumps({
        'kind': 'source-only-verification', 'main_checked': record['main_checked'],
        'original_assets_verified': len(assets), 'retained_spans_verified': len(spans),
        'chain_checks_passed': len(record['chain_checks']), 'frozen_cases_identical': len(record['cases']),
        'behavioral_cases_run': 0, 'native_or_visual_acceptance': False,
    }, indent=2))


if __name__ == '__main__':
    main()
