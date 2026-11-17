"""Verify source closure, disjoint composition, and preservation without JS execution."""
import hashlib
import json
from pathlib import Path
import subprocess

from prepare import follow_up, send_key

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PARENT = HERE.parent


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(name):
    return (HERE / 'reference' / (name + '.txt')).read_text()


record = json.loads((HERE / 'source.json').read_text())
for span in record['reference_spans']:
    raw = (HERE / span['path']).read_bytes()
    assert sha(raw) == span['sha256'], span['path']
    assert len(raw) == span['bytes'] == span['utf8_half_open'][1] - span['utf8_half_open'][0]
base = (PARENT / 'baseline/GeneralPage.tsx.txt').read_text()
send = subprocess.check_output(['git', 'show', '07f2494f:src/settings/GeneralPage.tsx'], cwd=ROOT, text=True)
current = (ROOT / 'src/settings/GeneralPage.tsx').read_text()
candidate = (HERE / 'candidate/GeneralPage.tsx.txt').read_text()
assert send == current == send_key(base)
assert candidate == follow_up(send) == send_key(follow_up(base))
assert sha(candidate.encode()) == record['composition']['candidate_sha256']
assert candidate[candidate.index('function SendKeyRow('):] == send[send.index('function SendKeyRow('):]
for path, digest in record['protected_product'].items():
    assert sha((ROOT / path).read_bytes()) == digest, path
assert 'new Zqe(s,t)' in (PARENT / 'reference/Be.txt').read_text()
assert '.catch(Ir)' in (PARENT / 'reference/Be.txt').read_text()
observer = read('observer')
assert 'this.#s=this.#e.getMutationCache().build(this.#e,this.options)' in observer
assert 'isPending:e.status==="pending"' in observer
assert 's?.mutationKey&&this.options.mutationKey' in observer
assert 'new jqe(' in read('mutation-cache')
mutation = read('mutation')
assert mutation.index('this.#n({type:"pending",variables:t') < mutation.index('const r=await this.#s.start()')
assert 'await this.options.onSettled?.(r,null,t,this.state.context),this.#n({type:"success",data:r})' in mutation
assert 'finally{this.#n({type:"error",error:r})}' in mutation
assert 'finally{this.#t.runNext(this)}' in mutation
assert 'status:"success"' in mutation and 'status:"error"' in mutation
assert 'retry:this.options.retry??0' in mutation
configuration = read('client-configuration')
assert 'new Hte({onError:' in configuration
assert 'mutations:{networkMode:"always"}' in configuration
assert 'onSuccess:' not in configuration and 'onSettled:' not in configuration
assert 'defaultMutationOptions(t)' in read('query-client')
assert 'await gee({key:iU,value:t})' in (PARENT / 'reference/JUt.txt').read_text()
assert 'return ee.updateSetting(t,e)' in read('writer')
assert 'Ie=t,ee=t}' in read('service-binding')
assert 'async updateSetting(e,s,n,r)' in read('update-setting')
assert 'return a.warn' in read('update-setting') and ',!1;' in read('update-setting')
# Preserve the original checkpoint's whole recorded manifest, not a replacement digest.
for line in (PARENT / 'frozen.sha256').read_text().splitlines():
    expected, path = line.split('  ', 1)
    assert sha((PARENT / path).read_bytes()) == expected, path
for line in (HERE / 'frozen.sha256').read_text().splitlines():
    expected, path = line.split('  ', 1)
    assert sha((HERE / path).read_bytes()) == expected, path
print(json.dumps({'lifecycle_spans': len(record['reference_spans']), 'closure_static': 'PASS',
                  'composition_both_orders': 'PASS', 'send_key_bytes': 'UNCHANGED',
                  'all_existing_product': 'UNCHANGED', 'old_frozen_packet': 'UNCHANGED',
                  'candidate_applied': False, 'behavioral_tests': 'NOT_RUN',
                  'typecheck': 'NOT_RUN', 'native_parity': 'UNVERIFIED'}))
