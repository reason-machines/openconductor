"""Verify preserved actual Chrome readbacks; does not drive or synthesize input."""
from pathlib import Path
from datetime import datetime
import gzip
import hashlib
import json

root = Path(__file__).parent
records = json.loads((root / 'browser-treatment-raw.json').read_text())
baseline = {row['observed']['case']: row['observed'] for row in json.loads((root / 'browser-baseline-raw.json').read_text())}
assert len(records) == len(baseline) == 8
cases = {}
for record in records:
    original = json.loads(json.loads(record['raw'])['result']['result']['value'])
    assert record['observed'] == original
    assert record['source_id'] and record['revision']
    case = original['case']
    assert case not in cases and case in baseline
    cases[case] = original
    witness = original['witness']
    before = baseline[case]
    assert witness['fixture'] == before['witness']['fixture']
    assert witness['errors'] == []
    assert witness['closed'] == witness['completed'] == 0
    if case == 'blank-both-enter':
        # The original blank record stored strings, not element metadata.
        assert [v['value'] for v in original['values']] == before['values'] == ['', '/synthetic/project-root']
        assert [v['id'] for v in original['values']] == ['project-name', '']
        assert all(v['disabled'] is False for v in original['values'])
    else:
        assert original['values'] == before['values'], case
    assert witness['shortcuts'] == before['witness']['shortcuts'], case
    assert all(e['trusted'] for e in witness['events'] if e['type'] in ('keydown', 'keyup', 'submit'))

cap = cases['capability']['witness']
assert cap['capabilitySubmits'] == 3 and cap['calls'] == []
assert cap['events'] == baseline['capability']['witness']['events']
assert all(e['trusted'] for e in cap['events'])
request = {'parentDir': '/synthetic/project-root', 'slug': 'fixture-project', 'template': 'empty', 'effect': 'inert pending Promise only'}
for case in ('name-plain-enter', 'parent-plain-enter'):
    actual = cases[case]
    assert baseline[case]['witness']['calls'] == [request]
    assert actual['witness']['calls'] == [] and actual['primary'] is False
    events = actual['witness']['events']
    assert [e['type'] for e in events] == ['keydown', 'keyup']
    assert all(e['key'] == 'Enter' and e['meta'] is False and e['trusted'] for e in events)
    # Baseline parent focus was stored as outerHTML; treatment stores the id.
    # Assert the key target and current id explicitly, not cross-schema parity.
    expected_id = 'project-name' if case == 'name-plain-enter' else ''
    assert actual['active'] == expected_id
    assert all(e['tag'] == 'INPUT' and e['id'] == expected_id for e in events)
for case in ('name-meta-enter', 'parent-meta-enter', 'primary-mouse-click', 'pending-drafts-editable'):
    actual = cases[case]
    assert actual['witness']['calls'] == baseline[case]['witness']['calls'] == [request]
    assert actual['primary'] is True
    assert not any(e['type'] == 'submit' for e in actual['witness']['events'])
for case in ('name-meta-enter', 'parent-meta-enter'):
    events = cases[case]['witness']['events']
    assert events[0]['key'] == 'Enter' and events[0]['meta'] is True
    # The unchanged DialogFrame's production shortcut invokes the button.
    assert [e['trusted'] for e in events if e['type'] == 'click'] == [False]
assert [e['trusted'] for e in cases['primary-mouse-click']['witness']['events']] == [True]
assert cases['blank-both-enter']['witness']['calls'] == []
assert cases['blank-both-enter']['primary'] is True
assert [e['meta'] for e in cases['blank-both-enter']['witness']['events'] if e['type'] == 'keydown'] == [False, True]
pending = cases['pending-drafts-editable']
assert [e['meta'] for e in pending['witness']['events'] if e['type'] == 'keydown'] == [True, False, True]
assert [v['value'] for v in pending['values']] == ['pending-draft', '/synthetic/pending-draft']
assert all(v['disabled'] is False for v in pending['values'])

bundle = json.loads((root / 'bundle-treatment.json').read_text())
assert bundle['inputCount'] == 189
assert bundle['inputs'] == json.loads((root / 'bundle-baseline.json').read_text())['inputs']
for source, expected in bundle['sourceHashes'].items():
    assert hashlib.sha256(Path(source).read_bytes()).hexdigest() == expected, source
for name in ('fixture.js', 'fixture.css', 'index.html'):
    assert gzip.decompress((root / ('treatment-' + name + '.gz')).read_bytes()) == (Path('.ara-state/create-project-enter-6013/public') / name).read_bytes()
html = gzip.decompress((root / 'treatment-index.html.gz').read_bytes()).decode()
assert "connect-src 'none'" in html and "form-action 'none'" in html
runtime = json.loads((root / 'browser-treatment-runtime.json').read_text())
assert datetime.fromisoformat(runtime['released_at']) < datetime.fromisoformat(runtime['deadline'].replace('Z', '+00:00'))
cleanup = runtime['cleanup']
assert cleanup['tabs'] == cleanup['own_fixture_processes'] == []
assert cleanup['preview_state'] == 'stopped' and cleanup['preview_listening'] is None
print('PASS: same 8 actual Chrome cases; plain Enter 1→0 in both fields; activation/blank/pending controls preserved; graph/assets/CSP and bounded cleanup intact')
