#!/usr/bin/env python3
"""Render the retained Composer source result, not a product screenshot."""
import html
import json
from pathlib import Path

root = Path(__file__).resolve().parent
packet = json.loads((root / 'matcher-closure.json').read_text())
esc = html.escape
rows = ''.join('<tr><td>' + esc(row['preset_without_custom_overrides']) + '</td><td>' + esc(row['event']) + '</td><td>' + esc(row['noncomposing_command']) + '</td></tr>' for row in packet['conditional_truth_table'])
chain = ''.join('<li>' + esc(item) + '</li>' for item in packet['chain'])
spans = ''.join('<li><b>' + esc(span['symbol']) + '</b><br><code>' + str(span['utf8_bytes_half_open']) + ' · ' + span['sha256_utf8'][:16] + '</code></li>' for span in packet['reference_spans'])
page = '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font:14px/1.5 var(--font-sans,system-ui);color:var(--foreground);margin:0}h1{font-size:22px;line-height:28px;font-weight:500;margin:0 0 12px}h2{font-size:17px;font-weight:500;margin:24px 0 12px}p{margin:8px 0}code{font:12px/1.5 var(--font-mono,monospace);overflow-wrap:anywhere}.muted{color:var(--muted-foreground)}.summary{border-left:3px solid var(--chart-1);padding-left:12px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--border);vertical-align:top}th{font-weight:500;color:var(--muted-foreground)}ol,ul{padding-left:22px}li{padding:4px 0}.scroll{overflow-x:auto}details{margin-top:20px}summary{cursor:pointer}a{color:var(--accent)}
</style></head><body><h1>Configured send matcher: source chain closed</h1><div class="summary"><p>No IME send defect is established. Both implementations guard ordinary composition signals before submission.</p><p class="muted">Conductor Rebuild · retained Conductor 0.87.6 · checked main <code>MAIN</code></p></div><h2>What the retained bytes establish</h2><ol>CHAIN</ol><h2>Enter behavior depends on effective bindings</h2><p>These rows condition on the named preset with no custom override. They are not a readout of the person's live settings. In every row, an active composition guard returns before matching.</p><div class="scroll"><table><thead><tr><th>Preset</th><th>Physical key</th><th>Noncomposing configured command</th></tr></thead><tbody>ROWS</tbody></table></div><h2>What remains unverified</h2><p>The <code>which=229</code>-only combination differs at the source boundary, but no actual browser event producer has established it. The inner handler's true/false default-handling difference is not runtime equivalence evidence.</p><p>No product change, regression RED/GREEN, typecheck, mounted editor, browser, native IME or provider check ran for this source investigation.</p><h2>Evidence quality</h2><p>Both full original asset hashes matched. Eleven exact byte spans close the previously missing matcher and binding lookup. The original REA renderer worker exhausted its heap; this result uses inert retained bytes, not a generated call graph or execution of the reference app.</p><details><summary>Hash-bound source spans</summary><ul>SPANS</ul></details></body></html>'''
page = page.replace('MAIN', esc(packet['checked_main'])).replace('CHAIN', chain).replace('ROWS', rows).replace('SPANS', spans)
(root / 'report.html').write_text(page)
