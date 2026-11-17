"""Inert retained-source byte qualification. Never imports/evaluates vendor JS."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
if len(sys.argv) != 3:
    raise SystemExit('Usage: python3 verify-source.py <retained-renderer> <retained-index>')
ASSETS = {
    'renderer': (Path(sys.argv[1]), 11600457, '5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde'),
    'index': (Path(sys.argv[2]), 3493297, 'b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3'),
}
RANGES = [
    ('renderer', 'route-state-storage-hook', 2708245, 2709881),
    ('renderer', 'filter-schema', 9818927, 9819132),
    ('renderer', 'filter-defaults', 9859706, 9859767),
    ('renderer', 'mFi', 9859767, 9860278),
    ('renderer', 'MJo', 9860278, 9862126),
    ('renderer', 'UJo', 9863549, 9874571),
    ('renderer', 'import-store', 54652, 54660),
    ('renderer', 'import-persist', 55379, 55388),
    ('renderer', 'import-json-storage', 56443, 56452),
    ('renderer', 'import-subsystem-storage', 56453, 56462),
    ('renderer', 'index-module', 66468, 66495),
    ('index', 'export-store', 3481027, 3481035),
    ('index', 'export-persist', 3482018, 3482026),
    ('index', 'export-json-storage', 3482836, 3482844),
    ('index', 'export-subsystem-storage', 3482845, 3482853),
    ('index', 'store-hook', 383617, 383845),
    ('index', 'store-core', 255286, 255610),
    ('index', 'json-storage', 255854, 256131),
    ('index', 'persistence', 256131, 257834),
    ('index', 'subsystem-storage', 2805969, 2806363),
    ('index', 'storage-root', 235507, 235557),
    ('index', 'storage-manager', 226825, 231110),
    ('index', 'storage-bridge', 231110, 235308),
    ('index', 'schema-array', 109854, 109890),
    ('index', 'schema-string', 106339, 106371),
]
LITERALS = {
    'filter-schema': ['projects:nv(vo())', 'archiveFilter:tFi', 'showArchived:hSe()'],
    'filter-defaults': ['projects:[]', 'archiveFilter:"active"'],
    'mFi': ['t??"personal"', 'uJe({routeId:"all-workspaces",scope:[n]})', 'stateKey:"filters",schema:wXo', 'Gde(o)'],
    'MJo': ['m?i.projects??[]:a.projects', 'a.archiveFilter'],
    'UJo': ['archiveFilter:G', 'MJo(H)', 'r||u||I||Ye===void 0', 'z.length>0&&!z.includes(hi.repositoryId)'],
    'route-state-storage-hook': ['Cvs="route-user-state-v1"', 'kvs="route-user-state"', 'storage:lDt(()=>tii({subsystem:kvs,sizeLimit:Tvs}))', 'const c=DGe(a)', 'schema:r,defaultValue:o', 'return[t,...e].map(encodeURIComponent).join("/")'],
    'store-hook': ['useSyncExternalStore'],
    'persistence': ['skipHydration', 'merge'],
    'subsystem-storage': ['Ms()', 'subsystem:'],
    'storage-root': ['new cFe(new lFe)'],
    'index-module': ['./index-BGEQ8YjU.js'],
    'import-store': ['bX as bf'], 'export-store': ['nr as bX'],
    'import-persist': ['d6 as sSe'], 'export-persist': ['Gy as d6'],
    'import-json-storage': ['eQ as lDt'], 'export-json-storage': ['PE as eQ'],
    'import-subsystem-storage': ['eR as tii'], 'export-subsystem-storage': ['i2 as eR'],
}

def digest(value): return hashlib.sha256(value).hexdigest()

blobs = {}
checks = 0
for key, (path, size, sha) in ASSETS.items():
    value = path.read_bytes()
    assert len(value) == size and digest(value) == sha, key
    blobs[key] = value
    checks += 1
records = []
(ROOT / 'spans').mkdir(exist_ok=True)
for asset, name, start, end in RANGES:
    data = blobs[asset][start:end]
    source = data.decode('utf8')
    for literal in LITERALS.get(name, []):
        assert literal in source, (name, literal)
        checks += 1
    path = ROOT / 'spans' / f'{name}.txt'
    path.write_bytes(data)
    records.append({'asset': asset, 'name': name, 'utf8_half_open': [start, end], 'sha256': digest(data), 'bytes': len(data), 'file': str(path.relative_to(ROOT))})
    checks += 1
fixture = ROOT / 'frozen/fixture.ts'
assert digest(fixture.read_bytes()) == 'aa3264f1cc330057277b52c8932ef0ede10850ef49ffa6b66ee1358c8e4ed5ec'
checks += 1
out = {'assets': {k: {'bytes': n, 'sha256': h} for k, (_, n, h) in ASSETS.items()}, 'source': records, 'checks_passed': checks,
       'parent_rea_evidence': 'ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367',
       'boundary': 'Syntax/byte evidence from retained real-app assets. No vendor evaluation, no new acquisition. Stable personal preference scope, no overriding Home URL filters. Eventual preference recovery, not native startup or first-paint timing. Original uses app-data subsystem storage; OpenConductor uses its existing localStorage filter key.'}
(ROOT / 'source.json').write_text(json.dumps(out, indent=2) + '\n')
print(json.dumps({'checks_passed': checks, 'spans': len(records), 'vendor_executed': False}))
