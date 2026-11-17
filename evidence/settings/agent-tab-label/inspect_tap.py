import argparse, hashlib, json, pathlib, re

CASES = json.loads(r'''["provider tabs have nonempty distinct DOM IDs","the active Claude panel is labelled by its selected tab","click selection updates the panel label without changing tab IDs","keyboard selection updates the panel label without changing tab IDs","external route selection updates the panel label and preserves tab IDs","separate mounted Agents pages have disjoint tab IDs and their own panel labels","existing panel labels and URL fields survive each route selection","K1 focus activation and modified-key ownership remain unchanged"]''')
p = argparse.ArgumentParser()
p.add_argument('--phase', choices=['red', 'green'], required=True)
p.add_argument('--exit-code', type=int, required=True)
p.add_argument('tap')
a = p.parse_args()
raw = pathlib.Path(a.tap).read_bytes()
tap = raw.decode('utf-8')
expected_failures = list(range(1, 7)) if a.phase == 'red' else []
assert a.exit_code == (1 if a.phase == 'red' else 0), ('unexpected exit', a.exit_code)
assert not re.search(r'^Bail out!', tap, re.M), 'TAP bailout'
results = list(re.finditer(r'^(not ok|ok) (\d+) - ([^\n]+)$', tap, re.M))
assert len(results) == len(CASES), ('result count', len(results))
assert [int(r[2]) for r in results] == list(range(1, 9)), 'case numbers'
assert [r[3] for r in results] == CASES, 'case identities/directives'
assert not any(re.search(r'#\s*(?:SKIP|TODO)\b', r[0], re.I) for r in results), 'actual result-line directive'
assert re.findall(r'^1\.\.(\d+)$', tap, re.M) == ['8'], 'TAP plan'
summary = {}
for name, expected in dict(tests=8, pass_=8-len(expected_failures), fail=len(expected_failures), cancelled=0, skipped=0, todo=0).items():
    name = 'pass' if name == 'pass_' else name
    values = re.findall(r'^# ' + name + r' (\d+)$', tap, re.M)
    assert values == [str(expected)], ('summary', name, values, expected)
    summary[name] = expected
failures = [int(r[2]) for r in results if r[1] == 'not ok']
assert failures == expected_failures, ('unexpected failure set', failures)
for index, result in enumerate(results):
    if result[1] == 'not ok':
        block = tap[result.end():results[index+1].start() if index+1 < len(results) else len(tap)]
        assert re.search(r"^\s+code: ['\"]ERR_ASSERTION['\"]$", block, re.M), ('not an intended assertion failure', result[2])
print(json.dumps(dict(phase=a.phase, classification='QUALIFYING_RED' if a.phase == 'red' else 'VALID_GREEN', exit_code=a.exit_code, summary=summary, failures=failures, raw_tap_sha256=hashlib.sha256(raw).hexdigest()), indent=2))
