"""Verify inert retained-source bytes. Never executes target JavaScript."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parent
receipt = json.loads((root / 'reference.json').read_text())
asset = Path(sys.argv[1]).read_bytes()
assert len(asset) == receipt['asset']['bytes']
assert hashlib.sha256(asset).hexdigest() == receipt['asset']['sha256']
spans = {}
for span in receipt['spans']:
    data = asset[span['start']:span['end']]
    assert len(data) == span['bytes'], span['name']
    assert hashlib.sha256(data).hexdigest() == span['sha256'], span['name']
    spans[span['name']] = data.decode()
view = spans['embedded-view']
checks = {
    'iframe': 'p.jsx("iframe",{ref:ae,src:ze,title:i' in view,
    'sandbox': 'sandbox:"allow-scripts allow-same-origin allow-popups allow-forms allow-modals"' in view,
    'reload_key': '`${ze}-${G}-${Q}`' in view,
    'workspace_reload': 'browserReloadRequestId[r]??0' in view,
    'host_locked': 'Nt.hostname!==F' in view,
    'port_path_control': '"aria-label":"Port and path"' in view,
    'external_fallback': 'He=()=>vs(i).fireAndForget()' in view and '"aria-label":"Open in browser"' in view,
    'identity': '`browser-preview:${t}:${e}`' in spans['surface-registry'],
    'park_on_unmount': 'activeAnchorId:void 0,isParked:!0' in spans['surface-registry'],
    'remove_closed_tabs': 'includes(r.url)||n(r.surfaceId)' in spans['surface-registry'],
    'anchor_cleanup': 'B(),_(d)' in spans['surface-anchor'],
    'persistent_host': 'Array.from(n.values())' in spans['persistent-host'] and 'p.jsx(kwa,{isVisible:n,url:e.url,localWorkspaceId:e.localWorkspaceId' in spans['persistent-host'],
    'tab_identity': 'new URL(t).host||t' in spans['browser-tab'] and 'ariaLabel:"Close browser view"' in spans['browser-tab'],
}
assert all(checks.values()), checks
print(f"PASS original asset identity, {len(spans)} exact complete spans, {len(checks)}/{len(checks)} static lifecycle joins; no target JS execution")
