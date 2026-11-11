"""Execute only the admitted Settings49 V3 RED, or its conditional unchanged GREEN."""
from pathlib import Path, PurePosixPath
import datetime, hashlib, io, json, os, platform, re, resource, shlex, shutil, signal, stat, subprocess, sys, tarfile, time
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
SNAP=ROOT/'snapshot'
BASE='b6e7473d17462ce09948437b4239fb0a31e8d37f'
ARCHIVE=Path('/home/runner/.reason/workspace/sessions/13576d11-76fb-4842-aa9b-c398f9ca26f3/.ara-run-chat-attachments/af0900dc-a369-4007-b6a8-5701611f2e9e/078c38b17d4ab7e2e92781dba586a0dafbeea44749a8083d9b7ef310732ca777-settings-assistant-filter-v3.tar.gz')
PREFLIGHT=REPO/'.source-prep-13576/settings49-v3-preflight-cc38648d/receipt.json'
OLD=REPO/'.source-prep-13576/typed-subagent-green-44ad916b/receipt.json'
TARGET='src/features/chat/Transcript.tsx'
phase=sys.argv[1]
assert phase in ('red','green')
receipt_file=ROOT/(phase+'-receipt.json')
assert not receipt_file.exists(), 'phase already attempted; no retry'
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
r={'author':'Conductor Rebuild','unit':'SETTINGS49_ASSISTANT_DISPLAY_FILTER_V3','phase':phase.upper(),'admission_message':'dcf4bb6c-c823-4160-bc55-42e0368e85d6','computer':{'id':'b3bf539c-baa9-5c0a-bd50-9c4212affce9','name':'Cloud computer 300'},'baseline_main':BASE,'started_at':now(),'node_started':False,'source_staged':False,'limits':{'heap_mib':384,'nice':19,'timeout_seconds':120,'kill_after_seconds':5,'outer_seconds':130,'workers':1,'source_bytes_max':16777216,'private_growth_bytes_max':100663296,'per_file_output_bytes_max':8388608},'exclusions':['no retry/install/export/new resolver','no npm/typecheck/build','no extra controls','no browser/native/provider/reference JS evaluation','no Composer36 or #1025 execution'],'gaps':['fixture-controlled display output, not live Settings persistence or IPC','no native/visual/real-IME/provider proof','no whole-app typecheck/build']}
process=None
tracked=None
source_expected=None
old_pins=None

def save():
    receipt_file.write_text(json.dumps(r,indent=2)+'\n')

def git(*args):
    return subprocess.check_output(['git',*args],cwd=REPO,stderr=subprocess.PIPE,timeout=20)

def inventory(root):
    out={}
    for p in sorted(root.rglob('*')):
        assert not p.is_symlink(), 'source symlink'
        if p.is_dir(): continue
        assert stat.S_ISREG(p.stat().st_mode), 'nonregular source file'
        out[p.relative_to(root).as_posix()]={'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
    return out

def private_bytes():
    return sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())

def qualify_resolver():
    old=json.loads(OLD.read_bytes())
    actual={}
    for name,digest in old['resolver_pins'].items():
        p=REPO/name
        assert p.is_file() and not p.is_symlink() and sha(p.read_bytes())==digest, 'resolver drift '+name
        actual[name]=digest
    assert len(json.loads((REPO/'node_modules/.package-lock.json').read_bytes())['packages'])==393
    entries={}
    for name,pin in old['physical_entries'].items():
        rel=pin['path'].split('/node_modules/',1)[1] if 'path' in pin else name
        p=REPO/'node_modules'/rel
        assert p.is_file() and p.resolve().is_relative_to((REPO/'node_modules').resolve()), 'missing/escaped physical '+name
        assert sha(p.read_bytes())==pin['sha256'], 'physical drift '+name
        if 'version' in pin:
            assert json.loads((REPO/'node_modules'/name/'package.json').read_bytes())['version']==pin['version'], 'version drift '+name
        entries[name]=pin['sha256']
    assert len(entries)==17
    node=Path(shutil.which('node') or '/nonexistent')
    assert node.is_file() and sha(node.read_bytes())==old['node_binary']['sha256'], 'node binary drift'
    assert {'system':platform.system(),'machine':platform.machine(),'kernel':platform.release()}==old['runtime'], 'platform drift'
    return actual,entries,node,old

try:
    save()
    tracked=git('status','--porcelain','--untracked-files=no')
    r['tracked_head']=git('rev-parse','HEAD').decode().strip()
    pins,entries,node,old=qualify_resolver()
    r['resolver_pins']=pins; r['physical_entries']=entries; r['installed_packages']=393
    r['node_binary']={'path':str(node),'sha256':sha(node.read_bytes()),'version_from_identical_prior_binary':old['node_binary']['version_from_identical_baseline_binary']}
    r['preflight_receipt_sha256']=sha(PREFLIGHT.read_bytes())
    disk=shutil.disk_usage(REPO)
    mem={line.split(':')[0]:int(line.split(':')[1].split()[0])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemTotal:','MemAvailable:'))}
    r['capacity_before']={'disk_free_bytes':disk.free,**mem}
    assert disk.free>100663296 and mem['MemAvailable']>402653184, 'capacity no longer qualifies'
    raw=ARCHIVE.read_bytes()
    assert len(raw)==1691972 and sha(raw)=='b4838c320bd72c0f8e7662b8bbe7c1fb87bc3de38c3e82ddbaba6aa4c18d5c03', 'archive identity drift'
    r['archive']={'attachment_id':'716df071-89d9-458b-a2d3-a17dba9cd061','bytes':len(raw),'sha256':sha(raw)}
    payload={}
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as t:
        ms=t.getmembers(); seen=set(); total=0
        for m in ms:
            p=PurePosixPath(m.name)
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in m.name and not {'.git','node_modules'} & set(p.parts) and m.name not in seen
            assert m.isdir() or m.isreg()
            seen.add(m.name); total+=m.size
            if m.isreg(): payload[m.name]=t.extractfile(m).read()
        assert total<16777216
    prefix='evidence/chat/assistant-text-filter/'
    request=json.loads(payload[prefix+'execution-request-v3.json'])
    qual=json.loads(payload[prefix+'qualification-v3.json'])
    assert request['baseline_main']==qual['baseline_main']==BASE
    r['request_sha256']=sha(payload[prefix+'execution-request-v3.json'])
    r['qualification_sha256']=sha(payload[prefix+'qualification-v3.json'])
    expected_red=['src/features/chat/'+x for x in ('copyCodeFeedback.test.ts','transcriptAgentSummary.test.ts','thinkingLinks.test.ts','thinkingToolLinks.test.ts','todoMixedRows.test.ts','userText.test.ts','assistantText.ts','assistantText.test.ts')]
    assert request['red_overlay']==expected_red
    assert request['green_overlay']==[TARGET]+expected_red
    baseline={n.removeprefix('baseline-tree/'):b for n,b in payload.items() if n.startswith('baseline-tree/')}
    candidates={n.removeprefix('candidate/'):b for n,b in payload.items() if n.startswith('candidate/')}
    assert len(baseline)==952 and set(candidates)==set(request['green_overlay'])
    archived=git('archive','--format=tar',BASE,'src','package.json','package-lock.json','tsconfig.json')
    git_files={}
    with tarfile.open(fileobj=io.BytesIO(archived),mode='r:') as t:
        for m in t.getmembers():
            if m.isdir(): continue
            assert m.isreg() and m.name not in git_files
            git_files[m.name]=t.extractfile(m).read()
    assert baseline==git_files, 'baseline full Git tree mismatch'
    for pin in qual['files']:
        name=pin['path']
        if 'baseline_sha256' in pin:
            assert len(baseline[name])==pin['baseline_bytes'] and sha(baseline[name])==pin['baseline_sha256'], 'baseline pin '+name
        b=candidates.get(name,baseline.get(name))
        assert b is not None and len(b)==pin['candidate_bytes'] and sha(b)==pin['candidate_sha256'], 'candidate pin '+name
    assert sha(baseline[TARGET])=='533b97a4f656a6bb6e72953c1a7809a82871fbfa5dbc8578d204b96ddc85e06e'
    assert sha(candidates[TARGET])=='7b98c1ab857e7c015bc04c0cab64b8206ef2741ab8dc87800a32f3576a00ac00'
    source=dict(baseline)
    for name in request['red_overlay']: source[name]=candidates[name]
    assert sum(map(len,source.values()))<16777216
    r['baseline_files']=len(baseline);r['baseline_bytes']=sum(map(len,baseline.values()))
    r['overlays']={name:{'bytes':len(candidates[name]),'sha256':sha(candidates[name])} for name in request['red_overlay']}
    if phase=='red':
        assert not SNAP.exists(), 'private source already exists; no retry'
        SNAP.mkdir()
        for name,b in sorted(source.items()):
            p=SNAP/name
            p.parent.mkdir(parents=True,exist_ok=True)
            p.write_bytes(b)
        (ROOT/'execution-request-v3.json').write_bytes(payload[prefix+'execution-request-v3.json'])
        (ROOT/'qualification-v3.json').write_bytes(payload[prefix+'qualification-v3.json'])
    else:
        qualification=json.loads((ROOT/'red-qualified.json').read_bytes())
        prior=json.loads((ROOT/'red-receipt.json').read_bytes())
        assert qualification['receipt_sha256']==sha((ROOT/'red-receipt.json').read_bytes()) and qualification['tap_sha256']==sha((ROOT/'red.tap').read_bytes())==prior['tap_sha256']
        assert qualification['qualified'] is True and prior['node_started'] and prior['exit_code']==1
        assert not prior['summary']['skipped'] and not prior['summary']['cancelled'] and prior['summary']['fail']>0
        expect_red={n:{'bytes':len(b),'sha256':sha(b)} for n,b in source.items()}
        assert inventory(SNAP)==expect_red, 'RED snapshot drift before sole GREEN delta'
        (SNAP/TARGET).write_bytes(candidates[TARGET])
        source[TARGET]=candidates[TARGET]
        r['only_delta_from_red']=TARGET
        r['red_qualified_receipt_sha256']=qualification['receipt_sha256']
    r['source_staged']=True
    source_expected={n:{'bytes':len(b),'sha256':sha(b)} for n,b in source.items()}
    assert inventory(SNAP)==source_expected
    r['source_files']=len(source_expected);r['source_bytes']=sum(len(b) for b in source.values());r['transcript_sha256']=sha(source[TARGET])
    (ROOT/(phase+'-source-inventory.json')).write_text(json.dumps(source_expected,indent=2)+'\n')
    r['source_inventory_sha256']=sha((ROOT/(phase+'-source-inventory.json')).read_bytes())
    assert not any((p/'node_modules').exists() for p in (ROOT,ROOT.parent,SNAP)), 'unexpected intervening resolver'
    command=shlex.split(request['focused_command'])
    assert command==['node','--experimental-strip-types','--test','--test-concurrency=1']+['src/features/chat/'+x for x in ('assistantText.test.ts','transcriptAgentSummary.test.ts','copyCodeFeedback.test.ts','thinkingLinks.test.ts','thinkingToolLinks.test.ts','todoMixedRows.test.ts','userText.test.ts')]
    command=['nice','-n19','timeout','--kill-after=5s','120s',str(node)]+command[1:]
    home=ROOT/'home';home.mkdir(exist_ok=True)
    temp=ROOT/'tmp';temp.mkdir(exist_ok=True)
    env={k:v for k,v in os.environ.items() if k not in {'NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','RESOURCE_LABEL_SAMPLER','RESOURCE_LABEL_DEPS'}}
    env.update({'NODE_OPTIONS':'--max-old-space-size=384','HOME':str(home),'XDG_CONFIG_HOME':str(home/'.config'),'XDG_CACHE_HOME':str(home/'.cache'),'TMPDIR':str(temp)})
    r['environment']={'NODE_OPTIONS':'--max-old-space-size=384','NODE_COMPILE_CACHE':'unset','NODE_PATH':'unset','HOME':'owned private root','TMPDIR':'owned private root'}
    r['command']=command;r['cwd']=str(SNAP);r['private_bytes_before']=private_bytes()
    assert r['private_bytes_before']<100663296
    assert git('status','--porcelain','--untracked-files=no')==tracked
    qualify_resolver()
    def child_limits():
        resource.setrlimit(resource.RLIMIT_FSIZE,(8388608,8388608))
    begin=time.monotonic()
    r['test_started_at']=now()
    save()
    with (ROOT/(phase+'.tap')).open('xb') as log:
        process=subprocess.Popen(command,cwd=SNAP,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,preexec_fn=child_limits)
        r['node_started']=True;save()
        def expired(sig,frame):
            os.killpg(process.pid,signal.SIGKILL)
            raise TimeoutError('outer 130s limit exceeded')
        signal.signal(signal.SIGALRM,expired);signal.alarm(130)
        try:
            _,status,usage=os.wait4(process.pid,0)
            process.returncode=os.waitstatus_to_exitcode(status)
        finally:
            signal.alarm(0)
    r.update({'exit_code':process.returncode,'test_terminal_at':now(),'duration_seconds':time.monotonic()-begin,'peak_rss_kib':usage.ru_maxrss,'user_cpu_seconds':usage.ru_utime,'system_cpu_seconds':usage.ru_stime})
    tap=(ROOT/(phase+'.tap')).read_bytes();text=tap.decode('utf8',errors='replace')
    r['tap_bytes']=len(tap);r['tap_sha256']=sha(tap)
    r['summary']={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)}
    r['top_level_results']=re.findall(r'^(?:not ok|ok) \d+ - .+$',text,re.M)
    r['error_codes']=re.findall(r'^\s+code: (.+)$',text,re.M)
    r['private_bytes_after']=private_bytes();r['private_growth_bytes']=r['private_bytes_after']-r['private_bytes_before']
    assert r['private_bytes_after']<100663296 and r['private_growth_bytes']<100663296, 'private growth limit'
    assert len(tap)<8388608, 'output limit'
    assert inventory(SNAP)==source_expected, 'source modified during phase'
    qualify_resolver();r['postrun_pins_unchanged']=True
    assert git('status','--porcelain','--untracked-files=no')==tracked, 'tracked tree modified'
    r['tracked_tree_unchanged']=True
    assert set(r['summary'])=={'tests','pass','fail','cancelled','skipped','todo'}, 'missing TAP terminal summary'
    assert r['summary']['cancelled']==r['summary']['skipped']==r['summary']['todo']==0, 'incomplete TAP cases'
    if phase=='red':
        assert process.returncode==1 and r['summary']['fail']>0, 'unexpected RED outcome'
        r['disposition']='RED_TERMINAL_AWAITS_ASSERTION_CLASSIFICATION_NO_GREEN_YET'
    else:
        assert process.returncode==0 and r['summary']['fail']==0 and r['summary']['tests']==r['summary']['pass'], 'GREEN not all pass'
        red=json.loads((ROOT/'red-receipt.json').read_bytes())
        assert [re.sub(r'^(?:not ok|ok) \d+ - ','',s) for s in r['top_level_results']]==[re.sub(r'^(?:not ok|ok) \d+ - ','',s) for s in red['top_level_results']], 'case names/count changed'
        r['disposition']='QUALIFIED_GREEN_ALL_IDENTICAL_CASES_PASS'
except Exception as e:
    r['disposition']='STOP_NO_RETRY'
    r['failure']={'type':type(e).__name__,'message':str(e)}
    if process is not None and process.returncode is None:
        try:os.killpg(process.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        try:process.wait(timeout=5)
        except Exception:pass
finally:
    r['terminal_at']=now()
    r['phase_process_released']=process is None or process.returncode is not None
    save()
    print(json.dumps({k:r[k] for k in ('unit','phase','node_started','source_staged','source_files','source_bytes','transcript_sha256','exit_code','duration_seconds','peak_rss_kib','summary','error_codes','private_growth_bytes','postrun_pins_unchanged','disposition','failure','terminal_at','phase_process_released') if k in r},indent=2))
