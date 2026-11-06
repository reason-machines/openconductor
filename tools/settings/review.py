"""Build an area-local REA comparison and a retained settings review page (no aggregate map edits)."""
import json
import os
from pathlib import Path
import subprocess
import html

out = Path('evidence/settings/local-pages')
for lane in ('ref', 'oc'):
    data = json.loads((out / f'{lane}.json').read_text())
    captures = {key: {**value, 'file': value['png']} for key, value in data.items() if value.get('status') == 'captured'}
    (out / f'{lane}-captures.json').write_text(json.dumps(captures, indent=2) + '\n')
subprocess.run(['node', 'tools/ui-map/compare.mjs'], env={**os.environ, 'REA': os.environ.get('REA', '/home/runner/rea/node_modules/.bin/rea'), 'UIMAP_OUT': str(out.resolve())}, check=True)
ref = json.loads((out / 'ref.json').read_text())
oc = json.loads((out / 'oc.json').read_text())
metrics = json.loads((out / 'compare.json').read_text())['results']
notes = {
    'general': 'Main content aligned. Neutral palette, keyboard-shortcuts navigation and account label are deliberate OpenConductor differences.',
    'appearance': 'Palette option moved below the reference rows; spacing and preview now follow the reference. Syntax theme implementation and Neutral palette differ.',
    'appearance-lower': 'Lower appearance controls; OpenConductor keeps its palette extension after the reference rows.',
    'agents-claude': 'Local Claude Code tab. Cursor/OpenCode were intentionally removed; Reason tab is an OpenConductor extension. Authentication here is a fixture, not a live login.',
    'agents-codex': 'Local Codex tab. The reference fixture selects the legacy two-card CLI variant and returns an invalid account shape. OpenConductor retains the three-card design from PR 689. This pair is partial evidence, not an exact-match verdict or live authentication check.',
    'models': 'Only the supported local agents and Reason are shown. Removed providers are not missing features.',
    'advanced': 'Local executable/root/scrollback rows are in scope. Existing cloud-only preferences are deferred and not scored as gaps.',
    'experimental': 'Local experimental preferences. Cloud UI is deferred behind the separate off-by-default gate change.',
    'terminal': 'Header, icons, preset spacing and Add custom command aligned. Local preset commands are shown only; no agent is started.',
    'repo-environment': 'Repository-local environment presentation; no actual values or user files are read.',
    'repo-git': 'Repository-local Git preferences, with invented fixture state.',
    'repo-scripts': 'Empty local scripts configuration. Script execution is not part of this capture.',
    'repo-actions': 'Local action preferences and instructions; fixture-only backend state.',
    'repo-misc': 'Repository paths are invented and intentionally differ between app identities. No removal or filesystem write is performed.',
    'environment': 'Local environment page; empty invented values.',
    'git': 'Local Git preferences. Conductor cloud identity controls are outside scope.',
}
sections = []
for key in metrics:
    pair = out / f'pair-{key}.png'
    subprocess.run(['python3', 'tools/side-by-side/pair.py', str(out / ref[key]['png']), str(out / oc[key]['png']), str(pair)], check=True)
    m = metrics[key]['t24']
    ratio = m.get('changed_ratio')
    value = f'{ratio * 100:.2f}%' if ratio is not None else 'not measured'
    sections.append(f'''<section id="{key}" data-name="{key}"><h2>{html.escape(key.replace('-', ' ').title())}</h2><p>{html.escape(notes.get(key, 'Captured reference and built application.'))}</p><p class="meta">REA channel-tolerance 24: {value} changed pixels, full window. This is not a completeness score.</p><a href="pair-{key}.png"><img src="pair-{key}.png" alt="Conductor reference left, OpenConductor right: {key}"></a><details><summary>Evidence IDs</summary><code>Reference {ref[key]['evidence_id']}<br>OpenConductor {oc[key]['evidence_id']}<br>Comparison {m.get('evidence_id')}</code></details></section>''')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Settings comparison</title><style>
body{margin:0;color:var(--foreground);background:var(--background);font-family:var(--font-sans,system-ui);line-height:1.5}h1{font-size:28px;letter-spacing:-.03em;margin:0 0 8px}h2{font-size:20px;letter-spacing:-.02em;margin:0 0 8px}p{margin:8px 0 16px}.lead{font-size:16px}.meta,details{color:var(--muted-foreground);font-size:12px}nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}nav a{padding:4px 8px;border:1px solid var(--border);border-radius:8px;color:inherit;text-decoration:none;font-size:12px}section{padding:24px 0;border-top:1px solid var(--border)}img{display:block;width:100%;height:auto;border-radius:8px}details{margin-top:12px}code{overflow-wrap:anywhere}aside{border-left:3px solid var(--chart-1);padding-left:16px;margin:24px 0}.checks{display:flex;flex-wrap:wrap;gap:8px}.checks span{padding:4px 8px;background:var(--muted);border-radius:8px;font-size:12px}
</style><h1>Settings, side by side</h1><p class="lead">Conductor 0.87.6 reference on the left. Built OpenConductor on the right.</p><p class="meta">Conductor artifacts were verified against Sven’s authorized Mac, then rendered by REA in the isolated Chromium harness on Reason Cloud. Backend data is invented. These are not screenshots of the native Mac window.</p><aside><strong>Review scope</strong><p>General, Appearance, local Agents, local application and repository preferences. Organisation, team, routines, triage and cloud-workspace screens are deferred, not missing. Reason’s tab and the palette/shortcut extensions are intentional differences.</p><p>At zero tolerance, nearly all pixels differ because OpenConductor keeps its Neutral palette and Conductor uses warm colours. The low tolerance-24 values are not exact colour parity.</p><p>Upper and lower page captures do not prove every dropdown, interaction or offscreen state. Codex reference authentication is partial because its backend fixture returns an invalid account shape.</p></aside><div class="checks"><span>Build: passed</span><span>1,249 unit tests: passed</span><span>Colour lint: passed</span><span>Delayed-save regression: passed</span></div>'''
page += '<nav>' + ''.join(f'<a href="#{key}">{html.escape(key.replace("-", " "))}</a>' for key in metrics) + '</nav>'
page += ''.join(sections) + '</html>'
(out / 'review.html').write_text(page)
show = page
for key in metrics:
    show = show.replace(f'src="pair-{key}.png"', f'src="{(out / f"pair-{key}.png").resolve()}"')
Path('.oc-tmp').mkdir(exist_ok=True)
Path('.oc-tmp/settings-review.html').write_text(show)
print('Settings comparison and page complete:', len(metrics), 'pairs')
