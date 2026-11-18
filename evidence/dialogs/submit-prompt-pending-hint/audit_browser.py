#!/usr/bin/env python3
"""Check original browser readbacks, frozen served graphs and cleanup receipts."""
from pathlib import Path
from datetime import datetime
import hashlib
import json

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
sha = lambda raw: hashlib.sha256(raw).hexdigest()
records = [json.loads(line) for line in (OUT / 'browser-readbacks.ndjson').read_text().splitlines()]
assert len(records) == 12
observations = {}
for record in records:
    raw = json.loads(json.loads(record['raw'])['result']['result']['value'])
    assert raw == record['observed'], record['case']
    assert record['source_id'] and record['revision']
    state = raw['state'] if record['case'] == 'baseline-idle' else raw
    assert state['errors'] == [], record['case']
    assert all(event['trusted'] for event in state['events']), record['case']
    observations[record['case']] = state
assert len(observations) == 12
outcomes = {}
for build in ['baseline', 'treatment']:
    rows = {}
    for case in ['idle', 'default-pending', 'custom-pending', 'rejected', 'resolved', 'blank']:
        state = observations[f'{build}-{case}']
        assert state['build'] == build
        assert state['custom'] == (case == 'custom-pending')
        if case in ['idle', 'blank']:
            assert state['requests'] == [] and state['closes'] == 0
            assert state['prompt'] == state['name'] == ''
            assert state['dialog'] and state['buttonDisabled']
            assert state['hint'] == '⌘↵' and state['button'] == 'Submit prompt⌘↵'
            assert not state['promptDisabled'] and not state['nameDisabled']
            assert state['alert'] is None
            if case == 'blank':
                # :disabled has pointer-events:none; retain the actual footer hit.
                assert state['events'] == [{'type': 'click', 'trusted': True, 'target': 'submit-prompt-footer'}]
            else:
                assert state['events'] == []
            rows[case] = True
            continue
        assert len(state['requests']) == 1
        assert state['requests'][0]['url'] == 'https://github.com/reason-machines/openconductor/issues/new?title=Prompt%3A+Keep+this+synthetic+prompt&body=%5BPROMPT+SUBMISSION%5D%0A%0AName%3A+Test+Author%0APrompt%3A%0AKeep+this+synthetic+prompt%0A%0A----%0AApp+Version%3A+0.test%0AOS%3A+synthetic'
        assert state['events'][:2] == [
            {'type': 'click', 'trusted': True, 'target': 'submit-prompt-submit'},
            {'type': 'submit', 'trusted': True, 'target': 'submit-prompt-form'},
        ]
        if case == 'resolved':
            assert state['closes'] == 1 and not state['dialog']
            assert all(state[key] is None for key in ['prompt','name','promptDisabled','nameDisabled','hint','button','buttonDisabled','alert'])
            assert state['events'][2:] == [{'type':'click','trusted':True,'target':'fixture-resolve'}]
            rows[case] = True
            continue
        assert state['closes'] == 0 and state['dialog']
        assert state['prompt'] == 'Keep this synthetic prompt' and state['name'] == 'Test Author'
        if case == 'rejected':
            assert not state['promptDisabled'] and not state['nameDisabled'] and not state['buttonDisabled']
            assert state['hint'] == '⌘↵' and state['button'] == 'Submit prompt⌘↵'
            assert state['alert'] == 'Failed to submit prompt. Please try again later.'
            assert state['events'][2:] == [{'type':'click','trusted':True,'target':'fixture-reject'}]
            rows[case] = True
        else:
            assert state['promptDisabled'] and state['nameDisabled'] and state['buttonDisabled']
            assert state['alert'] is None and len(state['events']) == 2
            if build == 'baseline':
                hint = '⌘D' if case == 'custom-pending' else '⌘↵'
                assert state['hint'] == hint and state['button'] == 'Submitting...' + hint
            rows[case] = state['hint'] is None and state['button'] == 'Submitting...'
    assert sum(rows.values()) == (4 if build == 'baseline' else 6)
    outcomes[build] = rows

bundle = json.loads((OUT / 'bundle.json').read_text())
baseline, treatment = bundle['records']
assert baseline['inputCount'] == treatment['inputCount'] == 28
assert baseline['inputs'].keys() == treatment['inputs'].keys()
component = 'src/components/SubmitPromptDialog.tsx'
for path in baseline['inputs']:
    if path != component:
        assert baseline['inputs'][path] == treatment['inputs'][path], path
        assert sha((ROOT / path).read_bytes()) == treatment['inputs'][path], path
assert treatment['componentSha256'] == sha((ROOT / component).read_bytes())
for name, expected in bundle['fixture'].items():
    assert sha((OUT / 'frozen-browser' / name).read_bytes()) == expected, name
for record in bundle['records']:
    for name, expected in record['served'].items():
        assert sha((ROOT / '.ara-state/submit-prompt-pending-hint-6013/public' / name).read_bytes()) == expected, name
        if name.endswith('.html'):
            html = (ROOT / '.ara-state/submit-prompt-pending-hint-6013/public' / name).read_text()
            assert "connect-src 'none'" in html and "form-action 'none'" in html
runtime = json.loads((OUT / 'browser-runtime.json').read_text())
assert datetime.fromisoformat(runtime['released_at']) < datetime.fromisoformat(runtime['deadline'].replace('Z','+00:00'))
assert runtime['cleanup']['tabs'] == runtime['cleanup']['own_server_processes'] == []
assert runtime['cleanup']['preview_state'] == 'stopped' and runtime['cleanup']['preview_listening'] is None
print(json.dumps({'result':'PASS','original_readbacks':len(records),'outcomes':outcomes,'baseline':'4/6 (two expected pending-hint failures)','treatment':'6/6','input_counts':[28,28],'frozen_fixture_sources':len(bundle['fixture']),'all_captured_events_trusted':True,'cleanup_before_deadline':True,'blank_click_note':'Disabled primary has pointer-events:none; real click hit footer, no submit or request.','limits':'Inert actual-component Linux Chrome; no original/full-App/native/provider/package acceptance'},indent=2))
