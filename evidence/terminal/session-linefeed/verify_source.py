#!/usr/bin/env python3
"""Verify retained source and frozen tests without evaluating JavaScript."""

import argparse
import hashlib
import json
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--original-dir', type=Path, required=True)
    parser.add_argument('--stage', choices=['baseline', 'candidate'], default='baseline')
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    record = json.loads((here / 'source.json').read_text())
    assets = {}
    for asset in record['artifacts']:
        data = (args.original_dir / asset['name']).read_bytes()
        assert len(data) == asset['bytes'] and digest(data) == asset['sha256'], asset['name']
        assets[asset['name']] = data
    spans = {}
    for span in record['spans']:
        data = (args.repo / span['path']).read_bytes()
        assert digest(data) == span['sha256'] and len(data) == span['bytes'], span['name']
        start, end = span['utf8_half_open']
        assert assets[span['asset']][start:end] == data, span['name']
        spans[span['name']] = data
    for check in record['chain_checks']:
        assert check['token'].encode() in spans[check['span']], check['name']
    assert b'convertEol' not in spans['renderer-options-update']
    product = (args.repo / 'src/features/terminal/session.ts').read_bytes()
    property_line = b'    convertEol: true,\n'
    if args.stage == 'candidate':
        assert product.count(property_line) == 1
        assert b'    allowProposedApi: true,\n' + property_line in product
        product = product.replace(property_line, b'', 1)
    assert b'convertEol' not in product
    assert digest(product) == record['baseline_product_sha256']
    assert b'term.unicode.activeVersion = "11";' in product
    fixture = (args.repo / 'src/features/terminal/sessionLineFeed.test.ts').read_bytes()
    assert digest(fixture) == record['fixture_sha256']
    assert fixture.count(b'\ntest(') == len(record['cases']) == 10
    for case in record['cases']:
        assert ('test("' + case + '"').encode() in fixture, case
    header = (args.repo / 'src/features/terminal/sessionUnicode.test.ts').read_bytes().split(b'\ntest(', 1)[0]
    assert header == fixture.split(b'\ntest(', 1)[0]
    assert b'buffer.active.getLine' in fixture and b'buffer.active.cursorX' in fixture
    for protected in record['protected_files']:
        assert digest((args.repo / protected['path']).read_bytes()) == protected['sha256'], protected['path']
    print(json.dumps({
        'kind': 'static-source-and-fixture-verification',
        'stage': args.stage, 'main_checked': record['main_checked'],
        'assets_verified': len(assets), 'spans_verified': len(spans),
        'chain_checks_passed': len(record['chain_checks']),
        'frozen_cases': len(record['cases']),
        'protected_files_unchanged': len(record['protected_files']),
        'behavioral_cases_run_by_this_verifier': 0,
        'native_or_visual_acceptance': False,
    }, indent=2))


if __name__ == '__main__':
    main()
