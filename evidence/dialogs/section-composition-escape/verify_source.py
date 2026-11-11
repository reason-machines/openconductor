import argparse
import hashlib
import json
import subprocess
import tarfile
from pathlib import Path

parser = argparse.ArgumentParser(description='Verify retained source bytes only. Does not execute JavaScript or component tests.')
parser.add_argument('--archive', type=Path, required=True)
archive_path = parser.parse_args().archive
root = Path(__file__).resolve().parent
reference = json.loads((root / 'reference.json').read_text())
sha = lambda raw: hashlib.sha256(raw).hexdigest()
assert sha(archive_path.read_bytes()) == reference['archive_sha256']
assets = {}
with tarfile.open(archive_path) as archive:
    for key, asset in reference['assets'].items():
        raw = archive.extractfile('.rea-work/retained-reference/' + Path(asset['file']).name).read()
        assert len(raw) == asset['bytes'] and sha(raw) == asset['sha256']
        assets[key] = raw
spans = {}
for span in reference['declarations']:
    start, end = span['utf8_half_open']
    raw = assets[span['asset']][start:end]
    assert len(raw) == span['bytes'] and sha(raw) == span['sha256']
    spans[span['name']] = raw.decode()
for needle in ['P=$.useRef(!1)', 'P.current||!k', 'function de(){ce.clear(),P.current=!0}', 'function ue(){ce.start(yD?5:0,()=>{P.current=!1})}', 'vc(Ye,"compositionstart",de)', 'vc(Ye,"compositionend",ue)', 'Qe(),ce.clear(),ae.clear()']:
    assert needle in spans['SZ'], needle
assert spans['yD'] == 'yD=typeof CSS<"u"&&!!CSS.supports?.("-webkit-backdrop-filter:none")'
assert 'setTimeout(()=>{this.currentId=ove,n()},e)' in spans['bS']
assert 'clearTimeout(this.currentId)' in spans['bS']
assert spans['ove'] == 'ove=0'
assert spans['Gl'] == 'function Gl(t){return t?.ownerDocument||document}'
assert 'escapeKey:g' in spans['Vrs'] and '_=SZ(c,' in spans['Vrs']
assert 'F&&p.jsx(Vrs,' in spans['_3i']
assert spans['Bjt'] == 'function Bjt(t){return _3i("dialog",t)}'
assert 'onKeyDown:P' in spans['Aya'] and '!B.nativeEvent.isComposing' in spans['Aya']
assert spans['_v'] == '_v=hEe' and spans['hEe'] == 'function hEe(t){return t}'
assert 'onKeyDown:ae' in spans['nd'] and 'Qh("dialog.primaryAction",ge.nativeEvent)' in spans['nd']
assert spans['Qh'] == 'ca as Qh' and spans['ca'] == 'TQt as ca'
assert 'nh(t).some(s=>Hfe(s,e)&&_Ut(s,e))' in spans['TQt']
for name, expected in reference['frozen_bytes_unchanged'].items():
    assert sha(Path(name).read_bytes()) == expected, name
    raw = subprocess.check_output(['git', 'show', reference['checked_main'] + ':' + name])
    assert sha(raw) == expected, name
fixture_hash, fixture_name = (root / 'fixture.sha256').read_text().strip().split('  ', 1)
assert sha(Path(fixture_name).read_bytes()) == fixture_hash
subprocess.run(['git', 'diff', '--check'], check=True)
print(json.dumps({'static_source': 'PASS', 'assets': len(assets), 'declarations': len(spans), 'frozen_files': len(reference['frozen_bytes_unchanged']), 'fixture_checksum': 'PASS', 'component_runtime': 'NOT_RUN', 'browser_native_visual': 'NOT_RUN'}))
