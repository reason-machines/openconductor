"""Execute original frozen GREEN26 once, only with the canonical ledger's actual admission."""
from pathlib import Path
import argparse, datetime, hashlib, json, os, resource, shutil, signal, subprocess
D=Path('.qa/queue-edit-keyboard-lock-135')
p=argparse.ArgumentParser(); p.add_argument('--reservation',required=True); a=p.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest()
raw=(D/'green-request.json').read_bytes()
assert sha(raw)=='6937ed5ac6316d1cf9ab186c45950cbae3a7919eb3e83ba738023cb4598d13b3'
r=json.loads(raw)
out=D/'runtime-green'; out.mkdir(exist_ok=False)
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt={'reservation':a.reservation,'started_utc':now(),'request_sha256':sha(raw),'command':r['command'],'node_test_executed':False}
proc=None
pins={v['path']:v for v in [r['fixture'],r['oracle'],*r['packet_pins'],*r['source_pins'],*r['dependency_files'],*r['package_contracts'],r['node_executable']]}
def verify():
    for pin in pins.values():
        b=Path(pin['path']).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'],pin['path']
    assert len(pins)==266
    return len(pins)
def members(group):
    found=[]
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():continue
        try:
            fields=(path/'stat').read_text().rsplit(')',1)[1].split()
            if int(fields[2])==group and fields[0]!='Z':found.append(int(path.name))
        except (OSError,ValueError):pass
    return found
def git(*args):return subprocess.check_output(['git','-c','gc.auto=0',*args])
try:
    assert 0 in os.sched_getaffinity(0),'CPU0 unavailable'
    receipt['free_bytes_before']=shutil.disk_usage('.').free
    assert receipt['free_bytes_before']>=4*1024**3,'free disk below 4GiB'
    own=[]
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():continue
        try:
            if (path/'cwd').resolve()==Path.cwd() and (path/'comm').read_text().strip() in ['node','cargo','rustc','bun','vite']:own.append(int(path.name))
        except OSError:pass
    receipt['own_runtime_jobs_before']=own
    assert not own,'own runtime already present'
    receipt['preflight_pin_checks']=verify()
    main=git('ls-remote','origin','refs/heads/main').decode().split()[0]
    receipt['actual_main']=main
    assert git('rev-parse','origin/main').decode().strip()==main,'fresh main not fetched'
    receipt['source_equivalent_checks']=0
    for pin in r['baseline_source_pins']:
        baseline=git('show',main+':'+pin['path'])
        assert len(baseline)==pin['bytes'] and sha(baseline)==pin['sha256'],pin['path']+' baseline differs from actual main'
        actual=Path(pin['path']).read_bytes()
        if pin['path']=='src/features/chat/Composer.tsx':
            old=b'if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;'
            new=b'if (e.target !== e.currentTarget || e.nativeEvent.isComposing || queue.editingId !== null) return;'
            assert baseline.count(old)==1 and actual==baseline.replace(old,new),'not the exact one-line treatment'
            receipt['exact_one_line_treatment']=True
        else:assert actual==baseline,pin['path']+' differs from actual main'
        receipt['source_equivalent_checks']+=1
    def limits():resource.setrlimit(resource.RLIMIT_FSIZE,(8*1024**2,8*1024**2))
    with (out/'test.stdout').open('wb') as stdout,(out/'test.stderr').open('wb') as stderr:
        receipt['test_started_utc']=now()
        proc=subprocess.Popen(r['command'],stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=limits)
        receipt['process_group']=proc.pid;receipt['node_test_executed']=True
        try:receipt['exit_code']=proc.wait(timeout=67)
        except subprocess.TimeoutExpired:
            receipt['wrapper_timeout']=True;os.killpg(proc.pid,signal.SIGTERM)
            try:proc.wait(timeout=5)
            except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=5)
            receipt['exit_code']=proc.returncode
        receipt['test_terminated_utc']=now()
except Exception as error:receipt['setup_or_wrapper_error']=str(error)
finally:
    if proc is not None and members(proc.pid):
        os.killpg(proc.pid,signal.SIGKILL)
        if proc.poll() is None:proc.wait(timeout=5)
    receipt['surviving_pids']=[] if proc is None else members(proc.pid)
    receipt['actual_cleanup_release_utc']=now()
    receipt['child_maxrss_kib_not_aggregate']=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    receipt['rss_scope']='Child maximum RSS, not aggregate process-group RSS or group cap; heap768MiB per Node process.'
    try:receipt['postrun_pin_checks']=verify()
    except Exception as error:receipt['postrun_drift_error']=str(error)
    receipt['outputs']=[]
    for path in sorted(out.glob('test.*')):
        b=path.read_bytes();receipt['outputs'].append({'path':str(path),'bytes':len(b),'sha256':sha(b)})
    receipt['retained_output_bytes']=sum(x['bytes'] for x in receipt['outputs'])
    receipt['within_output_16mib']=receipt['retained_output_bytes']<=16*1024**2
    (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))
