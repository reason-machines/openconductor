"""Inert-data checks only; never import/evaluate the reference JavaScript."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent
p = json.loads((root / 'reference.json').read_text())
assert p['bundle_bytes'] == 13025924
assert p['bundle_sha256'] == 'f72df80a11d76bacb7ed7e2a322b420e6250b4a2c7781272877b8c5cf985e6ab'
container = p['retained_container_readback']
assert container['bytes'] == 76147184
assert container['sha256'] == '5723ead40316bb29e3d0b446cdc82bede489cc75443d6ce08a4e6421ae6eac0d'
assert container['bundle_start'] == 62734375 and container['all_bundle_bytes_equal'] is True
spans = {}
for span in p['spans']:
    data = span['source'].encode()
    assert len(data) == span['bytes'] == span['end'] - span['start'], span['label']
    assert hashlib.sha256(data).hexdigest() == span['sha256'], span['label']
    spans[span['label']] = span['source']
assert len(spans) == 14
selector = spans['permission-selectors']
assert selector.startswith('function Mc3(') and selector.endswith('}\n')
assert selector.index('U.collaborationMode === "plan"') < selector.index('return zn4(')
assert 'if (!U)\n    return "bypassPermissions";\n  return B ? "auto" : "default";' in selector
schema = spans['query-options-schema']
assert all(x in schema for x in ['permissionMode: O.string().optional()', 'autoPermissionModeEnabled: O.boolean().optional()', 'initialClaudePermissionMode: O.union([O.literal("default"), O.literal("auto"), O.literal("bypassPermissions")]).optional()', 'resume: O.string().optional()'])
query = spans['query-handler']
assert 'let C = E === undefined' in query
assert 'C && V.initialClaudePermissionMode !== undefined' in query
assert 'requiresToolApprovals: V.initialClaudePermissionMode !== "bypassPermissions"' in query
assert 'autoPermissionModeEnabled: V.initialClaudePermissionMode === "auto"' in query
assert 'resume: V.resume' in query
assert 'options: n58' in spans['query-request-schema']
assert '$Z.parse(B)' in spans['query-route'] and 'gp5(' in spans['query-route']
assert 'autoPermissionModeEnabled: B.autoPermissionModeEnabled ?? false' in spans['query-to-config']
assert 'await Rc3(M, G)' in spans['live-reconciliation']
assert 'await U.queryResult.setPermissionMode(G)' in spans['live-reconciliation']
assert 'return CB5(' in spans['runner-reconcile']
message = spans['runner-message']
assert message.index('await this.reconcileSessionConfig(') < message.index('M.sendMessage(')
plan = spans['approved-plan-callback-excerpt']
assert 'if (Z?.approved)' in plan
assert '_targetMode: n' in plan and 'updatedPermissions: [{ type: "setMode", mode: n, destination: "session" }]' in plan
print('PASS: 14 exact source spans, container/bundle binding, selector/caller/schema/initial-mode/resume/reuse and approved-Plan protocol literals. Static evidence only; no runtime behavior claimed.')
