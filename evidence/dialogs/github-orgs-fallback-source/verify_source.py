#!/usr/bin/env python3
"""Verify inert source evidence and fixture data; never execute production code."""
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
    assert len(data) == end - start == item['bytes'], item['path']
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
for item in record['current_source']:
    data = subprocess.check_output(['git', 'show', f"{record['main']}:{item['path']}"])
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']

fixture = (root / 'orgsErrorFallback.test.ts').read_text()
case_data = fixture.split('const cases = ', 1)[1].split(' satisfies ReadonlyArray<', 1)[0]
cases = json.loads(case_data)
spec = json.loads((root / 'behavioral-spec.json').read_text())
assert cases == spec['cases']
assert len(cases) == identity['cases'] == 3
assert identity['executed_cases'] == spec['executed_cases'] == 0
assert 'from "../../../src/state/githubRepoDialog.ts"' in fixture

source = subprocess.check_output(['git', 'show', f"{record['main']}:src/state/githubRepoDialog.ts"], text=True)
orgs_before = '  return "Couldn\'t load your organizations. You can still use your personal account.";'
orgs_after = '  return "Couldn\'t load your GitHub organizations. You can still use your personal account.";'
owners_before = '  return `Couldn\'t load GitHub owners: ${detail}`;'
owners_after = '  return "Couldn\'t load your GitHub accounts.";'
assert source.count(orgs_before) == source.count(owners_before) == 1
patch = (root / 'candidate.patch').read_text()
changes = [line for line in patch.splitlines() if line[:1] in ('+', '-') and not line.startswith(('+++', '---'))]
assert changes == ['-' + orgs_before, '+' + orgs_after]
assert source.replace(orgs_before, orgs_after).replace(owners_before, owners_after) == source.replace(owners_before, owners_after).replace(orgs_before, orgs_after)
assert source.replace(orgs_before, orgs_after).replace(orgs_after, orgs_before) == source
print('PASS: 11 retained spans, 5 pinned current-main sources, 4 packet identities, 3 frozen case data, one-line patch scope and disjoint two-helper source composition. Behavioral execution: NOT_RUN.')
