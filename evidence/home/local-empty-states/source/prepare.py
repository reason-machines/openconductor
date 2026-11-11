#!/usr/bin/env python3
"""Reproduce a static source comparison without importing or executing either app."""
import hashlib
import html
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
PACKET = ROOT / 'evidence/home-filter-selection/source.json'
MAIN = '4739c9c029f87c64901a2431de6032b81f2b7348'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')


packet = json.loads(PACKET.read_text())
source = {s['name']: s for s in packet['spans']}
retained = {}
for name, filename in [('Home-UJo', 'reference-UJo.js.txt'), ('Home-filter-state-MJo', 'reference-MJo.js.txt')]:
    span = source[name]
    data = (OUT / filename).read_bytes()
    assert digest(data) == span['sha256']
    assert len(data) == span['bytes']
    span['text'] = data.decode('utf-8')
    retained[name] = {k: span[k] for k in ['kind', 'asset', 'utf8_half_open', 'utf16_half_open', 'bytes', 'sha256']}

for filename, path in [('main-AllWorkspaces.tsx.txt', 'src/components/AllWorkspaces.tsx'),
                       ('main-homeRows.ts.txt', 'src/home/allWorkspaces.ts')]:
    committed = subprocess.run(['git', 'show', f'{MAIN}:{path}'], cwd=ROOT, check=True, capture_output=True).stdout
    assert committed == (OUT / filename).read_bytes(), path

ujo = source['Home-UJo']['text']
mjo = source['Home-filter-state-MJo']['text']
component = (OUT / 'main-AllWorkspaces.tsx.txt').read_text()
helpers = (OUT / 'main-homeRows.ts.txt').read_text()
anchors = []


def anchor(name, text, fragment, parent=None, path=None):
    assert text.count(fragment) == 1, name
    at = text.index(fragment)
    prefix = text[:at]
    data = fragment.encode('utf-8')
    item = {'name': name, 'text': fragment, 'sha256': digest(data), 'bytes': len(data)}
    if parent:
        span = source[parent]
        byte_at = span['utf8_half_open'][0] + len(prefix.encode('utf-8'))
        unit_at = span['utf16_half_open'][0] + len(prefix.encode('utf-16-le')) // 2
        item.update(parent=parent, asset=span['asset'], utf8_half_open=[byte_at, byte_at + len(data)],
                    utf16_half_open=[unit_at, unit_at + len(fragment.encode('utf-16-le')) // 2])
    else:
        start = prefix.count('\n') + 1
        item.update(main_sha=MAIN, path=path, lines_inclusive=[start, start + fragment.count('\n')])
    anchors.append(item)


anchor('reference-data-loading-inputs', ujo, 'e=aa(),n=g5(),{data:i,isLoading:r}=Xh();', 'Home-UJo')
anchor('reference-repository-loading', ujo, 'const a=o,{data:c,isLoading:u}=nF();', 'Home-UJo')
anchor('reference-local-org-loading', ujo, '[x,w]=$.useState(""),{organization:E,baseUrl:k,isLoading:I}=so();', 'Home-UJo')
anchor('reference-local-owners-empty', ujo, 'if(!O){let Dr;t[33]===Symbol.for("react.memo_cache_sentinel")?(Dr=[],t[33]=Dr):Dr=t[33],Ze=Dr;break e}', 'Home-UJo')
anchor('reference-no-owner-filter', ujo, 'if(Ye.length===0){He=Ve;break e}', 'Home-UJo')
anchor('reference-known-repositories-only', ujo, 'hi=mo=>xe.has(mo.repositoryId)', 'Home-UJo')
anchor('reference-archive-project-predicate', ujo, 'hi=>!(G==="active"&&hi.state==="archived"||G==="archived"&&hi.state!=="archived"||z.length>0&&!z.includes(hi.repositoryId))', 'Home-UJo')
anchor('reference-local-no-pinned-items', ujo, 'Dr={pinnedItems:hi,unpinnedWorkspaces:Vt}', 'Home-UJo')
anchor('reference-display-predicates', ujo, 'const dr=Vn.length>0||wt.length>0,mr=Ye!==void 0&&Ye.length>0||z.length>0||G!=="all",Zr=O&&Ke.length>1,Tr=je.length>1,Or=U===void 0&&z.length===0&&G==="active"&&it.length===0,Jo=r||u||I||Ye===void 0;', 'Home-UJo')
anchor('reference-header-create', ujo, 'p.jsx(tt,{size:"sm",className:"shrink-0 text-sm",onClick:()=>n(),children:"Create workspace"})', 'Home-UJo')
anchor('reference-loading-consumer', ujo, 'Jo?p.jsx("div",{role:"status","aria-label":"Loading workspaces",className:"flex justify-center py-6 text-muted-foreground",children:p.jsx(ri,{type:"working",className:"size-4"})})', 'Home-UJo')
anchor('reference-empty-consumer', ujo, 'p.jsxs("div",{className:"py-6 flex flex-col items-center gap-3 text-sm text-muted-foreground",children:[p.jsx("span",{children:"No matching workspaces"}),Or?p.jsx(tt,{size:"sm",onClick:()=>n(),children:"Create a workspace"}):mr&&p.jsx(tt,{variant:"outline",size:"sm",onClick:J,children:"Clear filters"})]})', 'Home-UJo')
anchor('reference-clear-callback', mjo, 'L=()=>E({owners:[],projects:[],archiveFilter:"all"})', 'Home-filter-state-MJo')
anchor('reference-clear-does-not-set-query', mjo, 'w=H=>{c(H),o({search:{org:t,owners:H.owners,projects:H.projects.length>0?H.projects:void 0,state:H.archiveFilter==="active"?void 0:H.archiveFilter},replace:!0}).fireAndForget()}', 'Home-filter-state-MJo')

cp = 'src/components/AllWorkspaces.tsx'
hp = 'src/home/allWorkspaces.ts'
anchor('main-component-input-contract', component, 'interface Props {\n  repos: Repo[];\n  sidebarVisible: boolean;\n  dispatch: Dispatch<Action>;\n  onCreateWorkspace: () => void;\n}', path=cp)
anchor('main-empty-action-caller', component, 'const empty = emptyAction(repos, filters);', path=cp)
anchor('main-list-branch', component, '{groups.length > 0 ? (', path=cp)
anchor('main-empty-consumer', component, '<div className="allws-empty">\n              <span>No matching workspaces</span>\n              {empty === "create" && (\n                <button type="button" className="allws-create" onClick={onCreateWorkspace}>\n                  Create a workspace\n                </button>\n              )}\n              {empty === "clear" && (\n                <button type="button" className="allws-clear" onClick={() => setFilters(CLEARED_FILTERS)}>\n                  Clear filters\n                </button>\n              )}\n            </div>', path=cp)
anchor('main-empty-action-declaration', helpers, 'export function emptyAction(repos: readonly Repo[], filters: HomeFilters): EmptyAction {\n  const anyActive = repos.some((r) => r.workspaces.some((w) => w.status !== "archived"));\n  if (filters.projects.length === 0 && filters.archiveFilter === "active" && !anyActive) return "create";\n  return hasActiveFilters(filters) ? "clear" : null;\n}', path=hp)
anchor('main-filter-presence', helpers, 'export function hasActiveFilters(f: HomeFilters): boolean {\n  return f.projects.length > 0 || f.archiveFilter !== "all";\n}', path=hp)
anchor('main-clear-value', helpers, 'export const CLEARED_FILTERS: HomeFilters = { projects: [], archiveFilter: "all" };', path=hp)
anchor('main-groups-drop-empty', helpers, 'return BUCKET_ORDER.filter((b) => by.has(b)).map((b) => ({ bucket: b, label: BUCKET_LABELS[b], rows: by.get(b)! }));', path=hp)
assert 'aria-label="Loading workspaces"' not in component
assert 'isLoading' not in component
save('anchors.json', anchors)

cases = [
    ('loading-workspaces', [], 'active', [], '', 'workspaces', 'loading-input-not-exposed'),
    ('loading-repositories', [], 'active', [], '', 'repositories', 'loading-input-not-exposed'),
    ('loading-local-context', [], 'active', [], '', 'local-context', 'loading-input-not-exposed'),
    ('settled-initial-empty', [], 'active', [], '', None, 'match'),
    ('settled-archived-only', [('a', 'archived')], 'active', [], '', None, 'source-mismatch'),
    ('settled-project-filter-empty', [('a', 'active')], 'active', ['b'], '', None, 'match'),
    ('settled-query-empty', [('a', 'active')], 'active', [], 'absent', None, 'match'),
    ('settled-archived-filter-empty', [('a', 'active')], 'archived', [], '', None, 'match'),
    ('settled-all-unfiltered-empty', [], 'all', [], '', None, 'match'),
    ('settled-all-query-empty', [('a', 'active')], 'all', [], 'absent', None, 'match'),
    ('settled-all-project-filter-empty', [('a', 'active')], 'all', ['b'], '', None, 'match'),
    ('settled-list-control', [('a', 'active')], 'active', [], '', None, 'match'),
]
rows = []
for name, workspaces, archive, projects, query, loading, classification in cases:
    visible = [w for w in workspaces if (archive == 'all' or (w[1] == 'archived') == (archive == 'archived'))
               and (not projects or w[0] in projects) and not query]
    # These are manual transcriptions of the anchored predicates, not target execution.
    ref_create = not projects and archive == 'active' and len(workspaces) == 0
    filtered = bool(projects) or archive != 'all'
    main_create = not projects and archive == 'active' and not any(w[1] != 'archived' for w in workspaces)
    ref = 'Loading workspaces' if loading else 'rows' if visible else 'No matching workspaces'
    actual = 'rows' if visible else 'No matching workspaces'
    ref_action = None if loading or visible else 'create' if ref_create else 'clear' if filtered else None
    main_action = None if visible else 'create' if main_create else 'clear' if filtered else None
    rows.append({'case': name, 'input': {'local': True, 'owners': 'undefined', 'known_repo_workspace_states': workspaces,
                 'archive_filter': archive, 'projects': projects, 'query': query, 'loading_flag': loading},
                 'reference': {'branch': ref, 'empty_action': ref_action},
                 'current_main': {'branch': actual, 'empty_action': main_action},
                 'classification': classification})
save('truth-table.json', {'method': 'Static hand-transcribed predicate evaluation. Neither app is imported, mounted, or executed.',
                         'assumptions': ['All workspace records belong to known local repositories.',
                         'Reference owners U is undefined for this bounded table, not a claim about all saved preferences.',
                         'Reference state archived maps to current status archived.',
                         'The query absent has no match in any field. Search implementation is outside scope.',
                         'Loading flags are reference inputs, not available AllWorkspaces props; reachability in OpenConductor is unproven.'],
                         'cases': rows})

receipt = {'id': 'ACQ-HOME-LOCAL-EMPTY-271-02', 'producer': 'Conductor Rebuild / 27102e36',
           'status': 'STATIC_SETTLED_ARCHIVED_ONLY_ACTION_DIFFERENCE_LOADING_INTEGRATION_UNRESOLVED',
           'main_sha': MAIN, 'reference': packet['reference'], 'retained_declarations': retained,
           'offset_convention': packet['offset_convention'], 'anchors': len(anchors), 'cases': len(rows),
           'source_processing_only': True, 'target_javascript_executed': False,
           'missing_dependencies': ['g5 create-workspace callback implementation', 'tt generic button enablement implementation',
                                    'LJo default filter object and persisted preference inputs',
                                    'OpenConductor caller/loading integration outside permitted component/helper reads',
                                    'Xh/nF/so provider implementation and loading transitions'],
           'files': {name: {'sha256': digest((OUT / name).read_bytes()), 'bytes': (OUT / name).stat().st_size}
                     for name in ['reference-UJo.js.txt', 'reference-MJo.js.txt', 'main-AllWorkspaces.tsx.txt',
                                  'main-homeRows.ts.txt', 'anchors.json', 'truth-table.json']},
           'limits': ['No product or test edit.', 'No mounted/component test, typecheck, build, browser, provider, native, or new REA acquisition.',
                      'No reference runtime, visual parity, actual loading reachability, button implementation, or creation outcome is proven.',
                      'Original renderer upload is not placed in this recovered workspace. Retained exact source text and prior REA hashes are reused.']}
save('receipt.json', receipt)

esc = html.escape
tr = ''.join('<tr><th>' + esc(r['case']) + '</th><td>' + esc(r['reference']['branch']) + '<small>' + esc(r['reference']['empty_action'] or 'no empty action') + '</small></td><td>' + esc(r['current_main']['branch']) + '<small>' + esc(r['current_main']['empty_action'] or 'no empty action') + '</small></td><td>' + esc(r['classification']) + '</td></tr>' for r in rows)
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Home local empty states</title><style>
body{margin:0;color:var(--foreground);font:14px/1.5 var(--font-sans,system-ui)}h1{font-size:22px;line-height:28px;font-weight:500;margin:0 0 12px}h2{font-size:17px;font-weight:500;margin:24px 0 8px}p{margin:8px 0}small{display:block;color:var(--muted-foreground)}code{font-family:var(--font-mono,monospace);overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--border);padding:10px 8px;font-weight:400}thead th{font-weight:500;color:var(--muted-foreground)}.scroll{overflow-x:auto}.summary{border-left:3px solid var(--chart-2);padding-left:12px;margin:16px 0}li{margin:6px 0}a{color:var(--accent-foreground)}
</style><body><h1>Home local empty states</h1><p class="vis-text-muted">Conductor Rebuild · retained-source comparison · main <code>''' + MAIN[:12] + '''</code></p>
<div class="summary"><p>For a settled local list containing only archived workspaces, the retained Conductor predicates choose <strong>Clear filters</strong>. Current OpenConductor chooses <strong>Create a workspace</strong>.</p><p>This is a source difference, not an observed app defect or visual comparison.</p></div>
<h2>Same-input branch comparison</h2><p>Each row uses the same normalized local workspace records and filters. Loading inputs have no corresponding component prop on current main, so those rows expose an integration question, not a demonstrated loading bug.</p><div class="scroll"><table><thead><tr><th>Case</th><th>Retained reference</th><th>Current main source</th><th>Evidence class</th></tr></thead><tbody>''' + tr + '''</tbody></table></div>
<h2>Why the settled actions differ</h2><p>Reference <code>Or</code> tests <code>it.length === 0</code> before archive filtering. Current <code>emptyAction</code> tests that no workspace has a non-archived status. An archived record makes the former false and the latter true.</p>
<h2>Callbacks and button guards</h2><ul><li>Both Create call sites omit a disabled prop. The reference calls <code>n()</code>, obtained from <code>g5()</code>. Current main calls <code>onCreateWorkspace</code>. The callback implementations are not part of this packet.</li><li>Clear filters sets projects to an empty list and archive state to <code>all</code>. It does not clear the text query in either source. Reference additionally clears owners, which are outside the local product contract.</li><li>The reference generic <code>tt</code> button implementation is not retained here. No native enablement claim is made.</li></ul>
<h2>Focused fixture design, not executed</h2><p>Mount the unchanged production component with a known repository containing an archived workspace, default active filter, and empty query. Assert that the empty message appears, Clear filters is offered, and the empty-state Create action is absent. Drive Clear and assert that the archive mode becomes all without changing the query. Controls cover a truly empty repository, a project-filter miss, an archived-filter miss, and an all-mode query miss.</p>
<h2>Evidence and limits</h2><p>Two retained complete declarations and ''' + str(len(anchors)) + ''' exact source anchors carry SHA-256 digests and half-open UTF-8 byte and UTF-16 code-unit offsets. The bundle identity and REA evidence IDs are inherited from the completed retained packet. The original renderer upload is absent from this recovered workspace.</p><p>No product files changed. No app, reference JavaScript, component tests, browser, native process, install, build, provider, or new acquisition ran. Caller loading integration, saved-owner defaults, generic button enablement, and the Create implementation remain outside the available source boundary.</p></body></html>'''
(OUT / 'review.html').write_text(page)
print(json.dumps({'static_source_checks': 'pass', 'anchors': len(anchors), 'cases': len(rows),
                  'settled_source_mismatch_cases': [r['case'] for r in rows if r['classification'] == 'source-mismatch'],
                  'loading_integration_cases': [r['case'] for r in rows if r['classification'] == 'loading-input-not-exposed'],
                  'main_sha': MAIN, 'product_runtime': 'not run'}, indent=2))
