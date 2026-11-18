"""Verify retained evidence and import-path-only test port; never invoke Node."""
from pathlib import Path
import gzip
import hashlib
import json
import re

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
checks=[]
def check(label,condition):
    if not condition:raise AssertionError(label)
    checks.append(label)
def sha(raw):return hashlib.sha256(raw).hexdigest()
for entry in json.loads((HERE/'manifest.json').read_bytes()):
    raw=(HERE/entry['path']).read_bytes()
    check('identity '+entry['path'],len(raw)==entry['bytes'] and sha(raw)==entry['sha256'])
r=json.loads((HERE/'baseline/request.json').read_bytes())
g=json.loads((HERE/'request-green.json').read_bytes())
port=json.loads((HERE/'permanent-port.json').read_bytes())
frozen=(HERE/'baseline/composerQueueEditReturnFocus.test.ts.txt').read_bytes()
check('original immutable frozen fixture',sha(frozen)=='e275647b5174feb78281ff3ae2c0a5c3c735ccf2207da9815e66a3d965bf86be')
permanent=(ROOT/port['path']).read_text()
expected=frozen.decode()
for before,after in port['transforms']:
    check('port transform exists '+before,before in expected)
    expected=expected.replace(before,after)
check('only named import/type paths and comments changed',permanent==expected)
check('permanent identity',sha(permanent.encode())==port['sha256'])
check('20 permanent declarations',len(re.findall(r'^test\(',permanent,re.M))==20)
baseline=(HERE/'baseline/Composer.tsx.txt').read_bytes()
treatment=(HERE/'treatment-Composer.tsx.txt').read_bytes()
check('baseline Composer identity',sha(baseline)==r['baseline_source']['sha256'])
check('treatment Composer identity',sha(treatment)==g['treatment']['sha256'])
check('lossless original treatment diff',sha(gzip.decompress((HERE/'treatment.patch.gz').read_bytes()))=='69475239c8b33dc6ec38fbb8d5a7b946e975b6ed5672bf091cc05d58f7e53b2d')
check('current Composer equals tested treatment',(ROOT/g['treatment']['path']).read_bytes()==treatment)
check('outside QueuePanel prefix unchanged',baseline.split(b'function QueuePanel(')[0]==treatment.split(b'function QueuePanel(')[0])
check('QueueRow and suffix unchanged',baseline.split(b'interface RowProps {')[1]==treatment.split(b'interface RowProps {')[1])
check('all reducers and legacy contracts unchanged',all(sha((ROOT/p['path']).read_bytes())==p['sha256'] for p in g['all_source_pins'][1:]))
check('oracle immutable',sha((HERE/'baseline/oracle.json').read_bytes())=='d9f1d9b1a11764422c57ad3dbba7331c09d2b90edcf4dc5b0f21b7368f840979')
paired={}
for phase,passed,failed in [('red',14,6),('green',20,0)]:
    p=HERE/'runtime'/f'{phase}-test.stdout'
    output=gzip.decompress(p.with_suffix('.stdout.gz').read_bytes()).decode() if phase=='red' else p.read_text()
    receipt=json.loads((HERE/'runtime'/f'{phase}-receipt.json').read_bytes())
    paired[phase]=re.findall(r'^# Subtest: (.+)$',output,re.M)
    check(phase+' all20 names',len(paired[phase])==20)
    for key,value in [('tests',20),('pass',passed),('fail',failed),('cancelled',0),('skipped',0),('todo',0)]:
        check(f'{phase} {key}={value}',f'# {key} {value}\n' in output)
    failures=re.findall(r'^not ok \d+ - (.+)$',output,re.M)
    check(phase+' intended failures only',len(failures)==failed and all(n.startswith('return-focus/') for n in failures))
    check(phase+' assertion errors only',output.count("code: 'ERR_ASSERTION'")==failed)
    check(phase+' unchanged fixture',receipt['fixture_sha256']==r['fixture']['sha256'])
    check(phase+' identical command',receipt['command']==r['command'])
    check(phase+' expected exit',receipt['test_exit_code']==(1 if failed else 0))
    check(phase+' setup passed',receipt['static-preflight_exit_code']==receipt['node-capability_exit_code']==0 and 'setup_or_wrapper_error' not in receipt)
    check(phase+' no survivors',receipt['surviving_pids']==[] and bool(receipt['actual_release_utc']))
    check(phase+' output below16MiB',receipt['own_incremental_evidence_bytes']<16*1024**2)
check('paired cases unchanged',paired['red']==paired['green'])
check('six decisive names',sum(n.startswith('return-focus/') for n in paired['red'])==6)
check('14 control names',sum(n.startswith('control/') for n in paired['red'])==14)
for filename in ['spans.json','producer-spans.json']:
    for span in json.loads((HERE/'reference'/filename).read_bytes()):
        path=HERE/'reference'/(span['name']+'.txt')
        raw=span['literal'].encode() if 'literal' in span else path.read_bytes()
        if len(raw)==span['bytes']+1 and raw.endswith(b'\n'):raw=raw[:-1]
        check('reference '+span['name'],len(raw)==span['bytes'] and sha(raw)==span['sha256'])
binding=json.loads((HERE/'reference/corrected-binding.json').read_bytes())
check('20 historical REA joins retained',len(binding['corrected_slice']['site_bindings'])==20)
check('historical failed digest not silently repaired',bool(binding['supersedes']) and binding['disposition']=='REFERENCE_BINDING_CORRECTED_STATIC_ONLY')
missed=json.loads((HERE/'green-slot-no-run-20261117T224909714Z.json').read_bytes())
check('expired original GREEN explicitly no-run',missed['classification']=='NO_RUN' and missed['case_outcomes']['executed']==0)
adjacent=HERE/'runtime/permanent-adjacent-receipt.json'
receipt=json.loads(adjacent.read_bytes());output=(HERE/'runtime/permanent-adjacent-test.stdout').read_text()
request=json.loads((HERE/'request-permanent-adjacent.json').read_bytes())
check('adjacent request identity',sha((HERE/'request-permanent-adjacent.json').read_bytes())=='a1554ea11663afc6d1d5f25c04478474b7ef3c861e16dc156aadd298f2875868')
check('adjacent actual single admitted execution',receipt['test_executed'] and len(receipt['groups'])==1)
check('adjacent exact frozen command',receipt['command']==request['command'])
check('adjacent expected exit',receipt['exit_code']==0 and 'setup_or_wrapper_error' not in receipt)
for key,value in [('tests',155),('pass',155),('fail',0),('cancelled',0),('skipped',0),('todo',0)]:
    check(f'adjacent {key}={value}',f'# {key} {value}\n' in output)
check('adjacent no survivors',receipt['surviving_pids']==[] and receipt['all_postrun_pins_unchanged'])
check('adjacent source boundaries unchanged',receipt['outside_queue_panel_unchanged'])
check('adjacent CPU0 available',0 in receipt['preflight']['allowed_cpu_affinity'])
check('adjacent disk/workload gate',receipt['preflight']['free_disk_bytes']>=4*1024**3 and not receipt['preflight']['own_workloads'])
check('adjacent all244 pins verified',receipt['preflight']['pins_verified']==244)
check('adjacent bounded actual unit',receipt['actual_unit_elapsed_seconds']<95 and bool(receipt['actual_release_utc']))
check('adjacent output below16MiB',receipt['retained_output_bytes']<16*1024**2)
check('adjacent original20 outcomes intact',[n for n in re.findall(r'^# Subtest: (.+)$',output,re.M) if n in paired['green']]==paired['green'])
for entry in request['test_files']:
    check('adjacent named file unchanged '+entry['path'],sha((ROOT/entry['path']).read_bytes())==entry['sha256'])
print(json.dumps({'static_checks_passed':len(checks),'checks':checks,'node_or_product_execution':False,'adjacent_retained':True},indent=2))
