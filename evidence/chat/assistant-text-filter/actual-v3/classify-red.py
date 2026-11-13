from pathlib import Path
import datetime, hashlib, json, re
p=Path(__file__).resolve().parent
raw=(p/'red-receipt.json').read_bytes()
r=json.loads(raw)
tap=(p/'red.tap').read_bytes()
s=tap.decode()
h=lambda b:hashlib.sha256(b).hexdigest()
assert r['disposition']=='RED_TERMINAL_AWAITS_ASSERTION_CLASSIFICATION_NO_GREEN_YET'
assert r['summary']=={'tests':109,'pass':92,'fail':17,'cancelled':0,'skipped':0,'todo':0}
assert r['exit_code']==1 and r['postrun_pins_unchanged'] and r['tracked_tree_unchanged']
blocks=re.findall(r'^not ok .*?(?=^# Subtest:|^1\.\.|\Z)',s,re.M|re.S)
assert len(blocks)==17
assert not re.search(r'ERR_MODULE_NOT_FOUND|ERR_TEST_FAILURE|ReferenceError|TypeError|SyntaxError|Cannot find module|heap out of memory',s)
classified=[]
counts={}
for block in blocks:
    name=re.match(r'not ok \d+ - (.*)',block)[1]
    assert "code: 'ERR_ASSERTION'" in block and "name: 'AssertionError'" in block
    assert "transcriptAgentSummary.test.ts:" in block
    if name.startswith('assistant display prefix=') and ' enabled=true kind=' in name:
        category='enabled anchored-prefix text/thinking display'
        assert "0: 'Keep this.'" in block
    elif name.startswith('enabled assistant display hides trimmed-empty '):
        category='enabled trimmed-empty block display'
    elif name.startswith('enabled display filters streaming '):
        category='enabled streaming display'
        assert "0: 'Live answer'" in block
    elif name=='enabled display filters intermediate and preview text without changing their emphasis':
        category='intermediate/final display'
        assert "0: 'Intermediate'" in block
    elif name=='enabled display leaves user, report, system and tool payloads and raw copy/fork data untouched':
        category='assistant leaf display after earlier nonassistant leaf controls'
        assert "0: 'Keep raw.'" in block and 'test.ts:332:10' in block
    elif name=='mounted off/on/off rerender restores raw assistant text and thinking from the same transcript':
        category='mounted enabled rerender display'
        assert "0: 'Keep this.'" in block and 'test.ts:353:12' in block
    else:
        raise AssertionError('unexpected failure: '+name)
    counts[category]=counts.get(category,0)+1
    classified.append({'name':name,'category':category,'error_code':'ERR_ASSERTION','assertion_reached':True})
assert sorted(counts.values())==[1,1,1,2,2,10]
assert h(tap)==r['tap_sha256']
result={'author':'Conductor Rebuild','qualified':True,'receipt_sha256':h(raw),'tap_sha256':h(tap),'qualified_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'summary':r['summary'],'failure_categories':counts,'failures':classified,'note':'All 17 failures are the intended enabled display assertions. All 92 other cases passed, including helper and existing controls. Multi-assertion tests terminate at the reported display assertion; later checks in those failing bodies are not claimed until GREEN. No setup/import/type errors, skips, cancellations, timeouts or input drift. Conditional unchanged-case GREEN may now apply sole Transcript delta in private snapshot.'}
(p/'red-qualified.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'qualified':True,'summary':r['summary'],'failure_categories':counts,'receipt_sha256':result['receipt_sha256'],'tap_sha256':result['tap_sha256']},indent=2))
