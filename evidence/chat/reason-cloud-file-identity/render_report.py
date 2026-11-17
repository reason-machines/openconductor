#!/usr/bin/env python3
"""Render the frozen source-backed unit reproduction, not an app screenshot."""
from pathlib import Path
import html
import json

HERE = Path(__file__).resolve().parent
source = json.loads((HERE / 'source.json').read_text())
v = json.loads((HERE / 'verification.json').read_text())
inputs = json.loads((HERE / 'inputs.json').read_text())
observed = json.loads((HERE / 'observations.json').read_text())
freeze = json.loads((HERE / 'freeze.json').read_text())
esc = html.escape
rows = []
for c in inputs['cases']:
    clicks = [o for o in observed['observations'] if o['case'] == c['id']]
    failures = sum(o['declaredTarget']['place'] == 'cloud' and bool(o['effects']) for o in clicks)
    actions = sorted(set(e['kind'] for o in clicks for e in o['effects'] if e['kind'] != 'tab'))
    label = 'INTENDED FAIL' if failures else 'PASS'
    action = ', '.join(actions) if actions else 'cloud notice only'
    rows.append(f'<tr><td><code>{esc(c["id"])}</code></td><td>{len(clicks)}</td><td>{esc(action)}</td><td>{label}</td></tr>')
spans = ''.join(f'<details><summary>{esc(s.get("name", s["path"]))}</summary><p><code>{esc(s["path"])}</code> · bytes {s["start_byte"]}–{s["end_byte"]}</p><p class="muted">SHA-256 <code>{s["sha256"]}</code></p>' + (f'<pre>{esc(s["text"])}</pre>' if 'text' in s else '<p>Entire production module included unchanged.</p>') + '</details>' for s in source['rust_source_spans'])
js = ''.join(f'<details><summary>{esc(s["name"])}</summary><p class="muted">SHA-256 <code>{s["sha256"]}</code></p><pre>{esc(s["text"])}</pre></details>' for s in observed['executed_source'])
report = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reason cloud file identity</title><style>
body{margin:0;font:14px/20px var(--font-sans,system-ui);color:var(--foreground)}h1{font-size:22px;line-height:28px;font-weight:500;margin:8px 0 12px}h2{font-size:17px;line-height:24px;font-weight:500;margin:24px 0 12px}p{margin:8px 0 12px}a{color:var(--chart-1)}.muted{color:var(--muted-foreground)}.eyebrow{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-foreground)}.verdict{border-left:3px solid var(--chart-3);padding-left:12px;margin:16px 0 24px}.vis-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.vis-card{border:1px solid var(--border);border-radius:8px;padding:12px}.value{display:block;font-size:22px;line-height:28px;font-weight:500;font-variant-numeric:tabular-nums}code,pre{font:12px/18px var(--font-mono,monospace);overflow-wrap:anywhere}pre{white-space:pre-wrap;background:var(--muted);padding:12px;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;border-bottom:1px solid var(--border);padding:10px 6px;vertical-align:top}th{font-weight:500;color:var(--muted-foreground)}details{border-top:1px solid var(--border);padding:12px 0}summary{cursor:pointer;overflow-wrap:anywhere}li{margin-bottom:8px}footer{margin:24px 0 8px;padding-top:12px;border-top:1px solid var(--border);font-size:13px;color:var(--muted-foreground)}
</style></head><body>
<div class="eyebrow">Conductor Rebuild · frozen source-backed reproduction</div>
<h1>A known cloud result opens the local same-path file.</h1>
<p class="muted">Reason-specific one-chat local/cloud integration. Not a Conductor behavior claim, live provider test, or native parity claim.</p>
<div class="verdict"><strong>FROZEN RED · no product edits</strong><p>Six cloud-normalized targets dispatch to the local diff/viewer, both live and after save/restore. Their cloud provenance and Session ID still exist in the mounted transcript immediately before the click boundary.</p></div>
<div class="vis-grid"><div class="vis-card"><span class="muted">Baseline controls</span><span class="value">19 pass</span><span>Local, literal-cloud, chat/session and persistence controls</span></div><div class="vis-card"><span class="muted">Intended failures</span><span class="value">12 fail</span><span>Six target clicks × live/restored</span></div><div class="vis-card"><span class="muted">Adjacent checks</span><span class="value">66 / 66</span><span>No failures, skips or cancellations</span></div></div>
<h2>What the reproduction actually ran</h2>
<ol><li>Source-valid inert ACP metadata and tool notifications; same owned chat/Session, local → cloud → local.</li><li>Whole production Rust <code>updates.rs</code>, the exact extracted provider routing block, and unchanged wire serializer helpers.</li><li>Actual Reason listener, adapter, reducer, save/restore and row builder.</li><li>Mounted production Transcript and ToolRows; actual FileBadge click, then exact AST-extracted ChatPanel and Workspace file-open callbacks with inert state/diff witnesses.</li></ol>
<p>No full provider/process module was compiled. No provider, CLI, app, browser/native, credentials, remote request or real file-open/read IPC was used.</p>
<h2>Target controls and observed dispatch</h2>
<table><thead><tr><th>Case</th><th>Live + restored clicks</th><th>Observed destination</th><th>Verdict</th></tr></thead><tbody>__ROWS__</tbody></table>
<p>All 26 clicks executed. There are exactly 12 intended failures and no unexpected failures. Multi-diff cases test each rendered row target separately. Results keep exact text; child cloud paths keep their own Session ID; local actions work again after returning from cloud.</p>
<h2>Fresh source and freeze</h2>
<p>Checked main <code>__MAIN__</code>. Twelve relevant production files are hash-identical; eight Rust spans and thirteen extracted TypeScript spans are source-verified. Frozen test, inputs, wire, probe, generator and receipt bytes are verified unchanged after the completed baseline.</p>
<ul><li>New regression: <code>src/reasonCloudFileIdentity.test.ts</code><br>SHA-256 <code>__TEST_HASH__</code></li><li>Inert protocol input: <code>__INPUT_HASH__</code></li><li>Actual Rust wire output: <code>__WIRE_HASH__</code></li></ul>
<h2>Commands and decisive results</h2>
<pre>node --experimental-strip-types --test src/reasonCloudFileIdentity.test.ts
# exit 1: 31 tests; 19 pass; 12 intended fail; 0 skip

node --experimental-strip-types --test [reason, reducer, persist, conductorTools, view].test.ts
# exact five paths retained in README: exit 0; 66 pass

python3 evidence/chat/reason-cloud-file-identity/verify.py
# FROZEN_RED_VERIFIED</pre>
<p>The admitted cached-serde parser compile passed in 0.316 seconds; its replay passed. Initial linker-path and VM-constant setup errors are retained separately and are not counted as behavioral results. Own-process readback was empty and the heavy slot was explicitly released.</p>
<h2>Official contract and evidence limits</h2>
<p>The freshly read <a href="https://docs.reasonmachines.com/docs/build/choose-a-path.md">interface guide</a>, <a href="https://docs.reasonmachines.com/docs/acp.md">ACP reference</a> and <a href="https://docs.reasonmachines.com/docs/build/editor-app-acp.md">editor recipe</a> describe one provider and one Session spanning local/cloud. The fixture does not execute their live local/cloud acceptance procedure.</p>
<p>The cwd-normalized cloud shape is accepted by current production source; the retained CLI 0.2.683 observation of that shape remains historical. This proves the unit-level click misrouting, not current provider behavior. A safe repair must not reinterpret a target already known to be cloud as local. No new cloud-workspace/team UI is requested.</p>
<p><strong>Not run:</strong> current CLI/provider, built-app/native/browser/package behavior, packaged inclusion, typecheck, full Rust/app build, full-chat suite. Earlier full-chat timeouts stay incomplete. No UI screenshot exists because application/browser/native execution was not admitted.</p>
<h2>Exact executed source</h2><details><summary>Rust parser, routing and serialization identity</summary>__RUST__</details><details><summary>TypeScript listener, mounted transcript and click callbacks</summary>__JS__</details>
<footer>Prepared by Conductor Rebuild. Reproduction-only lease: one new regression and its evidence directory. All production and held WorkspaceView callbacks are unchanged. Product lease not granted; no repair or PR opened for this RED fixture.</footer>
</body></html>'''
report = report.replace('__ROWS__', ''.join(rows)).replace('__MAIN__', source['checked_main']).replace('__TEST_HASH__', freeze['src/reasonCloudFileIdentity.test.ts']).replace('__INPUT_HASH__', source['inputs_sha256']).replace('__WIRE_HASH__', observed['wire_sha256']).replace('__RUST__', spans).replace('__JS__', js)
(HERE / 'report.html').write_text(report)
print(json.dumps({'html_bytes': len(report.encode()), 'title': 'Reason cloud file identity'}))
