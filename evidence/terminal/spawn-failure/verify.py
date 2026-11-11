#!/usr/bin/env python3
"""Validate retained source bytes without evaluating third-party JavaScript."""
import argparse
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--originals', type=Path, help='Directory containing both retained original JavaScript assets')
args = parser.parse_args()
packet = json.loads((root / 'reference.json').read_text())
originals = {}
for artifact in packet['artifacts']:
    if args.originals:
        data = (args.originals / artifact['name']).read_bytes()
        assert len(data) == artifact['bytes'], artifact['name']
        assert hashlib.sha256(data).hexdigest() == artifact['sha256'], artifact['name']
        originals[artifact['artifact']] = data

texts = {}
for span in packet['spans']:
    data = (root / span['file']).read_bytes()
    assert len(data) == span['bytes'], span['name']
    assert hashlib.sha256(data).hexdigest() == span['sha256'], span['name']
    start, end = span['utf8_half_open']
    assert end - start == len(data), span['name']
    if originals:
        assert originals[span['artifact']][start:end] == data, span['name']
    texts[(span['artifact'], span['name'])] = data.decode('utf-8')

def text(artifact, name):
    return texts[(artifact, name)]

assert text('renderer', 'import-qc') == 'gh as qc'
assert text('index', 'export-gh') == 'ts as gh'
assert text('index', 'ts') == 'ts=DAt()'
assert 's=new $kt(' in text('index', 'DAt')
runtime = text('index', '$kt')
assert 'this.sessions.set(s.id,i)' in runtime
assert 'catch(a){throw this.sessions.delete(s.id),a}' in runtime
assert 'catch(a){throw this.sessionChangeEmitter.emit({...i.snapshot}),a}return s.id}' in runtime
controller = text('index', 'V9')
assert 'catch(o){throw FSt(this.snapshot,o),this.clearTrackedCommands(),this.diagnostics.logSpawnError(this.snapshot.error),this.emitChange(),o}' in controller
assert 'async restartShell(){ZSt(this.snapshot)&&await this.restartInteractiveShell({})}' in controller
assert text('index', 'ZSt') == 'function ZSt(t){return t.kind==="interactive"&&t.connectionState==="spawn_error"}'
assert 't.canStartShell=t.kind==="interactive"' in text('index', 'FSt')
assert 'a.connectionState="launching"' in text('index', 'PSt')
assert 'a.canStartShell=!1' in text('index', 'PSt')
assert 'catch(H){if(O)return;x(qc.getSession(w)??null);' in text('renderer', 'Xwa')
assert 'restartShell:async()=>{await qc.restartShell(w)}' in text('renderer', 'Xwa')
assert 'he=J?.canStartShell===!0' in text('renderer', 'eSa')
assert 'canRestartShell:he' in text('renderer', 'eSa')
assert 'state:{type:"error",message:m,canRetry:n,onRetry:o}' in text('renderer', 'Zwa')
assert 'const a=!n.canRetry' in text('renderer', 'tCt')
assert 'disabled:a,onClick:n.onRetry,children:"Retry"' in text('renderer', 'tCt')
assert 'id:this.ptyId,terminalId:e.metadata?.terminalId??e.id' in text('index', 'ySt')
assert 'const n=crypto.randomUUID()' in text('index', '_St')
assert text('renderer', 'import-Sh') == 'gl as Sh'
assert text('index', 'export-gl') == 'yo as gl'
assert 'Ns.getState().createTerminal' in text('index', 'yo')
assert 'createTerminal:' in text('index', 'Ns')
assert 'spawn_error' not in text('index', 'Ns')
assert 'p.jsx(eSa,{config:t.config,isVisible:t.isVisible,shouldFocus:t.shouldFocus})' in text('renderer', 'lSa')
print(json.dumps({
    'result': 'PASS', 'spans_verified': len(packet['spans']),
    'full_originals_rehashed': bool(originals), 'reference_executed': False,
    'main_compared': packet['main_comparison']['sha'],
    'native_or_visual_acceptance': 'not run',
}, indent=2))
