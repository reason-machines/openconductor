#!/usr/bin/env python3
"""Verify source identities and frozen fixture data without executing application code."""
from pathlib import Path
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent
record = json.loads((root / 'reference.json').read_text())
identity = json.loads((root / 'packet-identity.json').read_text())
for item in identity['files']:
    data = (root / item['path']).read_bytes()
    assert len(data) == item['bytes'], item['path']
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
for item in record['spans']:
    data = (root / item['path']).read_bytes()
    start, end = item['utf8_half_open']
    assert len(data) == end - start, item['path']
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
for item in record['current_source']:
    data = subprocess.check_output(['git', 'show', f"{record['main']}:{item['path']}"])
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']

fixture = (root / 'ownersErrorFallback.test.ts').read_text()
case_data = fixture.split('const cases = ', 1)[1].split(' satisfies ReadonlyArray<Case>;', 1)[0]
cases = json.loads(case_data)
spec = json.loads((root / 'behavioral-spec.json').read_text())
assert cases == spec['cases']
assert len(cases) == identity['cases'] == 8
assert identity['executed_cases'] == 0
assert 'from "../../../src/state/githubRepoDialog.ts"' in fixture
print('PASS: 11 retained literal spans, 3 pinned current-main sources, 4 packet identities, 8 frozen cases. Behavioral execution: NOT_RUN.')
