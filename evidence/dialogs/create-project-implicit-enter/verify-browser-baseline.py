"""Verify exported observed browser records; never drives or synthesizes input."""
from pathlib import Path
import gzip
import hashlib
import json

root = Path(__file__).parent
records = json.loads((root / 'browser-baseline-raw.json').read_text())
assert len(records) == 8
cases = {}
for record in records:
    original = json.loads(json.loads(record['raw'])['result']['result']['value'])
    assert record['observed'] == original
    assert record['source_id'] and record['revision']
    assert original['case'] not in cases
    cases[original['case']] = original
    witness = original['witness']
    assert witness['fixture'] == 'CREATE-PROJECT-IMPLICIT-ENTER-6013/v1'
    assert witness['errors'] == []
    assert witness['closed'] == witness['completed'] == 0
    assert all(event['trusted'] for event in witness['events'] if event['type'] in ('keydown', 'keyup', 'submit'))

cap = cases['capability']['witness']
assert cap['capabilitySubmits'] == 3 and cap['calls'] == []
assert [event['id'] for event in cap['events'] if event['type'] == 'keydown'] == ['cap-name', 'cap-parent']
assert sum(event['type'] == 'submit' for event in cap['events']) == 3
assert all(event['trusted'] for event in cap['events'])
request = {'parentDir': '/synthetic/project-root', 'slug': 'fixture-project', 'template': 'empty', 'effect': 'inert pending Promise only'}
for case in ('name-plain-enter', 'parent-plain-enter', 'name-meta-enter', 'parent-meta-enter', 'primary-mouse-click', 'pending-drafts-editable'):
    actual = cases[case]
    assert actual['witness']['calls'] == [request], case
    assert actual['primary'] is True, case
    assert actual['witness']['shortcuts'] == [{'key': {'kind': 'logical', 'value': 'Enter'}, 'modifiers': ['meta']}]
for case in ('name-plain-enter', 'parent-plain-enter'):
    events = cases[case]['witness']['events']
    assert [event['type'] for event in events] == ['keydown', 'click', 'submit', 'keyup']
    assert events[0]['key'] == 'Enter' and events[0]['meta'] is False
    assert all(event['trusted'] for event in events)
for case in ('name-meta-enter', 'parent-meta-enter'):
    events = cases[case]['witness']['events']
    assert events[0]['key'] == 'Enter' and events[0]['meta'] is True
    # Actual DialogFrame invokes the button on configured shortcut: retain its
    # observed untrusted click; do not mislabel that click as browser default.
    assert [event['trusted'] for event in events if event['type'] == 'click'] == [False]
assert cases['blank-both-enter']['witness']['calls'] == []
assert cases['blank-both-enter']['primary'] is True
assert [event['meta'] for event in cases['blank-both-enter']['witness']['events'] if event['type'] == 'keydown'] == [False, True]
pending = cases['pending-drafts-editable']
assert [event['meta'] for event in pending['witness']['events'] if event['type'] == 'keydown'] == [True, False, True]
assert [item['value'] for item in pending['values']] == ['pending-draft', '/synthetic/pending-draft']
assert all(item['disabled'] is False for item in pending['values'])
assert len([event for event in pending['witness']['events'] if event['type'] == 'submit']) == 1

for item in json.loads((root / 'baseline-input-identities.json').read_text()):
    assert hashlib.sha256(Path(item['path']).read_bytes()).hexdigest() == item['sha256'], item['path']
for name, target in [('baseline-fixture.js.gz', 'fixture.js'), ('baseline-fixture.css.gz', 'fixture.css'), ('baseline-index.html.gz', 'index.html')]:
    assert gzip.decompress((root / name).read_bytes()) == (Path('.ara-state/create-project-enter-6013/public') / target).read_bytes()

print('PASS: 8 exported browser cases; 2 observed implicit-Enter discrepancies; controls and frozen inputs intact')
