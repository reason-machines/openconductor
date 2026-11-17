#!/usr/bin/env python3
"""Verify inert literal bytes; never import/evaluate/execute vendor code."""
import argparse, hashlib, json
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--renderer',type=Path)
p.add_argument('--index',type=Path)
a=p.parse_args()
root=Path(__file__).resolve().parent
m=json.loads((root/'manifest.json').read_text())
sha=lambda data:hashlib.sha256(data).hexdigest()
parents={}
for name in ('renderer','index'):
    path=getattr(a,name)
    if path is not None:
        data=path.read_bytes()
        assert (len(data),sha(data))==(m['assets'][name]['bytes'],m['assets'][name]['sha256']),name
        parents[name]=data
for rec in m['records']:
    literal=(root/rec['path']).read_bytes()
    start,end=rec['utf8_half_open']
    assert len(literal)==rec['bytes']==end-start,rec['symbol']
    assert sha(literal)==rec['sha256'],rec['symbol']
    assert literal.decode().encode()==literal,rec['symbol']
    if rec['asset'] in parents:
        assert parents[rec['asset']][start:end]==literal,rec['symbol']
print(json.dumps({'status':'passed','literal_records':len(m['records']),'full_parents_checked':list(parents),'vendor_execution':False}))
