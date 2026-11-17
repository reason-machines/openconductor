"""Verify literal REA provenance without importing/evaluating the reference assets."""
from pathlib import Path
import hashlib,json,subprocess
root=Path(__file__).parent
m=json.loads((root/'qualification.json').read_text())
for span in m['spans']:
    b=(root/span['file']).read_bytes()
    assert len(b)==span['bytes']
    assert hashlib.sha256(b).hexdigest()==span['sha256']
for item in m['current_source']:
    b=subprocess.check_output(['git','show',m['main']+':'+item['path']])
    assert hashlib.sha256(b).hexdigest()==item['sha256']
assert hashlib.sha256((root/'historical-qualification.mjs.txt').read_bytes()).hexdigest()==m['fixture']['sha256']
s=lambda name:(root/'spans'/f'{name}.txt').read_text()
assert s('flag-default')=='Te("experimental_configurable_center_panel",!1)'
assert s('flag-reader')=='function s5t(){return ln(KE)}'
assert s('reader-export')=='s5t as d9' and s('reader-import')=='d9 as oSe'
assert 'if(!(i===void 0?!1:i))' in s('feature-wrapper')
assert 'p.jsx(Dji,' in s('feature-wrapper') and 'p.jsx(bXo,' in s('feature-wrapper')
assert '=yYo(h)' in s('group-surface-mounts')
assert 'oi("nav.splitTab",()=>{const he=ae();!he||he.group.tabs.length<2||i2.splitCenterPanelGroup(' in s('consumer-yYo')
assert 'activeGroupId:n,root:WH(' in s('center-layout-model-store')
assert 'orientation:"horizontal",firstSize:50' in s('center-layout-model-store')
assert 'function m5e(' in s('center-layout-model-store') and 'workspace-center-panel-layout-v1' in s('center-layout-model-store')
assert 'U8.setState({centerPanelLayouts:{...n,[t]:r}})' in s('center-layout-model-store')
print(f"PASS: {len(m['spans'])} exact retained spans, four baseline source identities, conditional gate/consumer/model/persistence chain, historical qualifier identity")
