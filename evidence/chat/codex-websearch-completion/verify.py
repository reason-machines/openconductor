#!/usr/bin/env python3
"""Cheap immutable-source, frozen-baseline and treatment-scope verification."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--renderer', type=Path)
p.add_argument('--index', type=Path)
p.add_argument('--green', type=Path, help='optional treatment output directory from the frozen runner')
a = p.parse_args()
here = Path(__file__).resolve().parent
root = here.parents[2]
tests = root / 'tests/chat-web-completion'
sha = lambda b: hashlib.sha256(b).hexdigest()
packet = json.loads((here / 'source.json').read_text())
freeze = json.loads((tests / 'freeze.json').read_text())
assert sha((here / 'source.json').read_bytes()) == freeze['source_packet']
for name, digest in freeze['files'].items():
    assert sha((tests / name).read_bytes()) == digest, name
for span in packet['spans']:
    assert sha(span['text'].encode()) == span['sha256'], span['name']
    asset = getattr(a, span['asset'])
    if asset:
        b = asset.read_bytes()
        assert sha(b) == packet['parents'][span['asset']]['sha256']
        assert len(b) == packet['parents'][span['asset']]['bytes']
        assert b[span['start_byte']:span['end_byte']] == span['text'].encode(), span['name']
for name, literal in packet['reference_joins']:
    assert literal in next(s['text'] for s in packet['spans'] if s['name'] == name), (name, literal)
for path, digest in packet['current_files'].items():
    if path != 'src-tauri/src/agent/codex_wire.rs':
        assert sha((root / path).read_bytes()) == digest, path
baseline = (here / 'baseline-codex_wire.rs.txt').read_bytes()
assert sha(baseline) == packet['current_files']['src-tauri/src/agent/codex_wire.rs']
old = b'            json!({ "query": item.get("query") }),\n            None,\n            None,\n'
new = b'''            json!({ "query": item.get("query") }),
            (!started && status == ToolStatus::Completed).then(|| {
                let query = text(item, "query").unwrap_or_default();
                if query.is_empty() {
                    "Web search completed".to_owned()
                } else {
                    format!("Web search completed for: {query}")
                }
            }),
            None,
'''
assert baseline.count(old) == 1
expected = baseline.replace(old, new, 1)
actual = (root / 'src-tauri/src/agent/codex_wire.rs').read_bytes()
hook = b'\n#[cfg(test)]\n#[path = "../../../tests/chat-web-completion/native.rs"]\nmod web_search_completion_tests;\n'
assert actual in [expected, expected + hook], 'unexpected product changes beyond the leased output expression/test-only hook'
log = gzip.decompress((here / 'baseline.tap.gz').read_bytes()).decode()
cases = json.loads((tests / 'cases.json').read_text())['cases']
observed = re.findall(r'^(ok|not ok) \d+ - (producer|mounted) ([^:]+):', log, re.M)
assert observed == [('ok' if c['method'] == 'item/started' else 'not ok', k, c['id']) for c in cases for k in ['producer', 'mounted']]
assert log.count("code: 'ERR_ASSERTION'") == 8
assert log.count('CODEX_WEBSEARCH_COMPLETION_RESULT_MISSING') == 4
assert log.count('CODEX_WEBSEARCH_COMPLETION_ROW_HAS_NO_DISCLOSURE') == 4
for line in ['# tests 12', '# pass 4', '# fail 8', '# cancelled 0', '# skipped 0']:
    assert line in log, line
adjacent = (here / 'adjacent-baseline.tap').read_text()
for line in ['# tests 42', '# pass 42', '# fail 0', '# cancelled 0', '# skipped 0']:
    assert line in adjacent, line
if a.green:
    green = (a.green / 'mounted.tap').read_text()
    for line in ['# tests 12', '# pass 12', '# fail 0', '# cancelled 0', '# skipped 0']:
        assert line in green, line
    payloads = json.loads((a.green / 'payloads.json').read_text())
    assert [r['id'] for r in payloads] == [c['id'] for c in cases]
    for case, row in zip(cases, payloads):
        assert row['payloads'][0]['output'] == case['expectedOutput']
print(json.dumps({'original_spans': len(packet['spans']), 'original_joins': len(packet['reference_joins']), 'frozen_files': len(freeze['files']), 'unchanged_consumer_files': len(packet['current_files']) - 1, 'baseline': '4 pass / 8 intended assertion failures', 'adjacent': '42/42 pass', 'treatment_scope': 'PASS', 'green': '12/12 pass' if a.green else 'NOT_CHECKED'}, indent=2))
