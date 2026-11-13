from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'source.json').read_text())
checks = []
for file, expected in manifest['immutable_files'].items():
    actual = hashlib.sha256((root / file).read_bytes()).hexdigest()
    assert actual == expected, file
    checks.append(file)
for span in manifest['reference_spans']:
    data = (root / span['path']).read_bytes()
    start, end = span['utf8_half_open']
    assert len(data) == end - start == span['bytes'], span['path']
    assert hashlib.sha256(data).hexdigest() == span['sha256'], span['path']
    data.decode('utf8')
    checks.append(span['path'])
provider = (root / 'reference/theme-provider.txt').read_text()
assert '[r,o]=$.useState("dark")' in provider
assert 'H!==null&&rOr(H)&&!u.current.selectedMode&&o(()=>H)' in provider
assert 'selectedMode:r,setSelectedMode:F=>{u.current.selectedMode=!0,o(F)' in provider
assert 'r==="system"?U=P:(U=r,P!==U&&L(U))' in provider
caller = (root / 'reference/theme-provider-caller.txt').read_text()
assert 'p.jsx(oOr,{storageKey:"melty-theme",children:' in caller
adapter = (root / 'reference/theme-storage-adapter.txt').read_text()
assert 'return s}return null' in adapter
print(json.dumps({'immutable_files_and_spans': len(checks), 'source_joins': 6, 'status': 'PASS'}))
