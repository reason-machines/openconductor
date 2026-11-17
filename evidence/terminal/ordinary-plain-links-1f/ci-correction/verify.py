"""Inert correction audit; never runs npm, a browser, or retained vendor code."""
import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
meta = json.loads((HERE / 'manifest.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
checks = 0


def check(value, message):
    global checks
    assert value, message
    checks += 1


old = gzip.decompress((HERE / 'caffeinateConsumer.test.ts.original.txt.gz').read_bytes())
check(sha(old) == meta['original_sha256'], 'archived original identity')
current = (ROOT / 'src/features/settings/caffeinateConsumer.test.ts').read_bytes()
a, b = meta['original_setup_utf8_half_open']
x = current.index(b'    const dependencyFiles = [')
y = current.index(b'    const result = runGraph(folder, "baseline");', x)
check(sha(current[x:y]) == meta['new_setup_sha256'], 'exact reviewed dependency setup')
check(current[:x] + old[a:b] + current[y:] == old,
      'all graph guards, test definitions, browser invocations and behavior assertions unchanged')
for path, expected in meta['file_hashes'].items():
    check(sha((ROOT / path).read_bytes()) == expected, f'unchanged bytes {path}')
for name, passed, failed in [('before.tap.gz', 0, 1), ('setup.tap.gz', 7, 0), ('adjacent.tap.gz', 39, 0)]:
    text = gzip.decompress((HERE / name).read_bytes()).decode()
    for key, count in [('pass', passed), ('fail', failed), ('skipped', 0), ('cancelled', 0)]:
        check(f'# {key} {count}\n' in text, f'{name} {key}={count}')
red = gzip.decompress((HERE / 'before.tap.gz').read_bytes()).decode()
check('Fixture setup failure: dependency drift in package.json' in red, 'exact reproduced CI setup failure')
check("code: 'ERR_ASSERTION'" in red, 'assertion failure rather than a loader failure')
print(f'PASS {checks} correction checks; historical guards/oracles unchanged; browser/build replay remains hosted')
