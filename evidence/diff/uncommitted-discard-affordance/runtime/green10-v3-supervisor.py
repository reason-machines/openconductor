import datetime, fcntl, hashlib, importlib.util, json, os, shutil, signal, subprocess, sys, time
from pathlib import Path
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds').replace('+00:00','Z')
sha=lambda data:hashlib.sha256(data).hexdigest()
root=Path('.').resolve(); state=root/'.oc-tmp/uncommitted-discard-runtime'
log=state/'green10-v3.log'; receipt_path=state/'green10-v3-receipt.json'
assert not log.exists() and not receipt_path.exists(), 'NO overwrite of original phase artifacts'
r={'phase':'GREEN10-V3','admission':'SAMEDE6-GREEN10-20261118T021212979Z','actual_start_utc':now(),'root':str(root),'node_started':False,'child_command':['node','--experimental-strip-types','--test','tests/diff/uncommittedDiscardAffordance.mounted.test.mjs']}
child=None; helper=None; started=None; peaks=0; minimum=shutil.disk_usage(root).free; reason='preflight'; released=True
pinned={}; installed_bytes={}; rc=2
visible=lambda:[{'pid':int(p.parent.name),'comm':p.read_text().strip()} for p in Path('/proc').glob('[0-9]*/comm') if p.exists() and p.read_text().strip() in ('node','nodejs','npm','npm exec','npm run')]
with (state/'lease.lock').open('a') as lease:
 fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  assert 0 in os.sched_getaffinity(0), 'CPU0 unavailable'
  assert minimum >= 4*1024**3, 'disk floor'
  before=visible(); r['visible_own_node_npm_before']=before; assert not before, 'existing own Node/npm'
  treatment=json.loads((root/'evidence/diff/uncommitted-discard-affordance/source-treatment.json').read_text())
  records=treatment['complete_red_input_comparison']['records']
  assert len(records)==41 and sum(v['status']=='LEASED_TREATMENT' for v in records.values())==2
  expected={n:{'sha256':v['after_sha256'],'bytes':v['bytes']} for n,v in records.items()}
  assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()=='3382c0f5979e9617379e4faa22f40951d4afb934', 'treatment HEAD drift'
  assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],text=True).strip(), 'tracked tree dirty'
  r['preservation_treatment_exceptions']=['src/features/diff/target.ts','src/features/diff/target.test.ts']
  r['unchanged_original_preservation_inputs']=39
  r['preservation_input_count']=len(expected)
  for name, pin in expected.items():
   data=(root/name).read_bytes()
   assert sha(data)==pin['sha256'] and len(data)==pin['bytes'], f'preservation drift: {name}'
   pinned[name]={'sha256':sha(data),'bytes':len(data)}
  fixture=root/'tests/diff/uncommittedDiscardAffordance.mounted.test.mjs'; data=fixture.read_bytes()
  assert sha(data)=='a2aef693638daac179d28cfdce96dea63bb4022d9e06cb7e68731b732060402b' and len(data)==13165, 'fixture pin'
  start=data.index(b'for (const layout of ["unified", "split", "file"])')
  assert sha(data[start:])=='fb7c64475dd4d41efb4722df10479321f860115f8bb4002fd064f43f418868b3', 'case body pin'
  pinned[str(fixture.relative_to(root))]={'sha256':sha(data),'bytes':len(data)}
  helper_path=root/'.oc-tmp/uncommitted-discard-provisioner/v3/deps-only.py'; helper_bytes=helper_path.read_bytes()
  assert sha(helper_bytes)=='78861d873063538e9099e6a9c99bab9ea12fb90ba6d40e4b07c43443a5c8cb82' and len(helper_bytes)==9232, 'helper pin'
  pinned[str(helper_path.relative_to(root))]={'sha256':sha(helper_bytes),'bytes':len(helper_bytes)}
  marker=state/'owns-node-modules.json'; ownership=json.loads(marker.read_text())
  assert ownership['root']==str(root) and ownership['owner']=='SAMEDE6', 'ownership/root mismatch'
  assert not state.is_symlink() and not (root/'node_modules').is_symlink() and (root/'node_modules').is_dir(), 'owned dependencies absent/unsafe'
  assert not os.path.lexists(state/'npm-cache'), 'cache unexpectedly present'
  r['owned_marker']=ownership
  lock=json.loads((root/'package-lock.json').read_text())['packages']; ilock_path=root/'node_modules/.package-lock.json'; ilock=json.loads(ilock_path.read_text())['packages']
  installed_bytes[str(ilock_path.relative_to(root))]=ilock_path.read_bytes()
  versions={'react':'18.3.1','react-test-renderer':'18.3.1','typescript':'5.9.3','@pierre/diffs':'1.6.4','fuzzysort':'3.1.0'}; identities=[]
  for name,version in versions.items():
   key='node_modules/'+name; placement=root/key
   assert placement.is_dir() and not placement.is_symlink() and placement.resolve()==placement, 'installed placement mismatch: '+name
   manifest=root/key/'package.json'; content=manifest.read_bytes(); actual=json.loads(content)['version']; wanted=lock[key]; found=ilock[key]
   assert actual==version==wanted['version']==found['version'], 'installed version mismatch: '+name
   assert found['resolved']==wanted['resolved'] and found['integrity']==wanted['integrity'], 'lock identity mismatch: '+name
   installed_bytes[str(manifest.relative_to(root))]=content
   identities.append({'name':name,'version':actual,'resolved':found['resolved'],'integrity':found['integrity'],'version_match':True,'resolved_match':True,'SRI_match':True})
  r['current_five_identities']=identities
  subprocess.run(['git','fetch','origin','main'],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
  main=subprocess.check_output(['git','rev-parse','origin/main'],text=True).strip(); r['main_sha']=main
  sources=list(treatment['fresh_main_bindings']['records'])
  assert len(sources)==22
  bindings={}
  for name in sources:
   actual=(root/name).read_bytes(); fresh=subprocess.check_output(['git','show',f'{main}:{name}'])
   assert sha(fresh)==treatment['fresh_main_bindings']['records'][name]['main_sha256'], 'fresh-main drift: '+name
   assert sha(actual)==treatment['fresh_main_bindings']['records'][name]['treatment_sha256'], 'treatment drift: '+name
   bindings[name]={'bytes':len(actual),'sha256':sha(actual),'main_equal':actual==fresh,'main_sha256':sha(fresh)}
   pinned[name]={'bytes':len(actual),'sha256':sha(actual)}
  r['fresh_main_bindings']=bindings; r['inputs']=pinned
  r['head_sha']=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
  r['assigned_branch']=subprocess.check_output(['git','branch','--show-current'],text=True).strip()
  assert r['assigned_branch']=='fix/appearance-search-rows-and-terminal-font'
  assert os.environ.get('DIFF_DISCARD_BASELINE') is None, 'unexpected baseline override'
  spec=importlib.util.spec_from_file_location('same_de6_reviewed_helpers',helper_path); helper=importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
  assert helper.ROOT==root
  for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP): signal.signal(sig,helper.interrupted)
  env=dict(os.environ,UV_THREADPOOL_SIZE='1',NODE_OPTIONS='--max-old-space-size=768')
  command=r['child_command']; node=shutil.which('node'); assert node is not None and os.access(node,os.X_OK)
  r['node_executable']={'path':node,'bytes':Path(node).stat().st_size,'elf':Path(node).read_bytes()[:4]==b'\x7fELF'}
  assert r['node_executable']['elf'], 'Node executable not expected ELF'
  r['limits_capability_preflight']={'cpu0_available':True,'node_executable':True}
  for name in ['evidence/diff/uncommitted-discard-affordance/runtime/red10-v3.log','evidence/diff/uncommitted-discard-affordance/runtime/red10-v3-receipt.json','evidence/diff/uncommitted-discard-affordance/runtime/red10-v3-classification.json','evidence/diff/uncommitted-discard-affordance/source-treatment.json']:
   b=(root/name).read_bytes(); pinned[name]={'bytes':len(b),'sha256':sha(b)}
  started=time.monotonic(); r['child_start_utc']=now()
  with log.open('xb') as output:
   child=subprocess.Popen(command,cwd=root,env=env,stdout=output,stderr=subprocess.STDOUT,start_new_session=True,preexec_fn=helper.limits)
   r['node_started']=True; r['child_pgid']=child.pid
   while True:
    members=helper.group_members(child.pid); rss=sum(size for _pid,size in members); free=shutil.disk_usage(root).free
    peaks=max(peaks,rss); minimum=min(minimum,free)
    if helper.STOP or rss>2*1024**3 or free<4*1024**3 or time.monotonic()-started>=120:
     reason=helper.STOP or ('rss-limit' if rss>2*1024**3 else 'disk-floor' if free<4*1024**3 else 'timeout-120s'); break
    if child.poll() is not None:
     reason='child-exit'; break
    time.sleep(0.1)
  r['child_end_utc']=now(); r['elapsed_child_s']=round(time.monotonic()-started,6)
 except Exception as error:
  reason=f'{type(error).__name__}: {error}'; r['error']=reason
 finally:
  if child is not None:
   try: released=helper.stop_group(child,min(time.monotonic()+5,started+125))
   except Exception as error: released=False; r['release_error']=f'{type(error).__name__}: {error}'
   r['child_exit']=child.returncode; r['group_survivors']=helper.group_members(child.pid)
   rc=child.returncode if reason=='child-exit' and released else 2
  r['reason']=reason; r['release_status']='RELEASED' if released is True else 'UNRELEASED'; r['child_group_released']=released
  r['actual_release_utc']=now(); r['peak_sampled_group_rss_bytes']=peaks; r['minimum_free_bytes']=minimum
  r['limits']={'cpu':0,'nice':10,'UV_THREADPOOL_SIZE':1,'heap_MiB_per_Node_process':768,'child_s':120,'term_kill_grace_s':5,'foreground_s':130,'sampled_group_rss_bytes':2*1024**3,'free_floor_bytes':4*1024**3,'sample_s':0.1,'scope':'userspace sampled live process-group RSS/free-space guards, not kernel/burst/escaped-group/disk quotas'}
  changes=[]
  for name,pin in pinned.items():
   try:
    contents=(root/name).read_bytes()
    if sha(contents)!=pin['sha256'] or len(contents)!=pin['bytes']: changes.append(name)
   except Exception: changes.append(name)
  r['post_input_drift']=changes
  r['installed_identity_bytes_unchanged']=all((root/name).read_bytes()==data for name,data in installed_bytes.items())
  r['modules_retained']=(root/'node_modules').is_dir(); r['marker_retained']=marker.is_file() if 'marker' in locals() else (state/'owns-node-modules.json').is_file(); r['cache_absent']=not os.path.lexists(state/'npm-cache')
  r['visible_own_node_npm_after']=visible(); r['filesystem_cleanup_attempted']=False
  if log.exists(): r['raw_output']={'path':str(log.relative_to(root)),'bytes':log.stat().st_size,'sha256':sha(log.read_bytes())}
  if changes or not released or r['visible_own_node_npm_after']: rc=2
  if not r['node_started']: r['classification']='NO_RUN'
  receipt_path.write_text(json.dumps(r,indent=2)+'\n')
  print(json.dumps({'phase':r['phase'],'node_started':r['node_started'],'start':r.get('child_start_utc'),'end':r.get('child_end_utc'),'exit':r.get('child_exit'),'reason':reason,'actual_release_utc':r['actual_release_utc'],'released':released,'survivors':r.get('group_survivors'),'visible_after':r['visible_own_node_npm_after'],'post_input_drift':changes,'peak_rss_bytes':peaks,'minimum_free_bytes':minimum,'raw_output':r.get('raw_output'),'receipt':str(receipt_path.relative_to(root))},indent=2))
  if log.exists(): print(log.read_text())
sys.exit(rc)