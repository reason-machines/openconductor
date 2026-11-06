"""Scope and observation accounting for the retained Conductor evidence."""
from collections import Counter, OrderedDict
from html import escape
from pathlib import Path
import json
import re

STATUSES = ("missing", "wrong", "matches", "unverified")
CLOUD_PATH = re.compile(r"^/(?:team(?:/|$)|routines(?:/|$)|automations(?:/|$)|cloud-collab-onboarding|new-member-onboarding|settings/(?:cloud|organization)(?:/|$)|settings/user/ports(?:/|$))")
SCREEN_STATES = OrderedDict([
    ("home", ("Home", ["home-empty", "home"], "Current native side-by-side and final review not recorded.")),
    ("sidebar", ("Sidebar", ["sidebar-after-archive", "all-workspaces"], "Expanded, collapsed and populated sidebar details need current native review.")),
    ("workspace-chat", ("Workspace / chat", ["workspace-chat", "workspace-new-chat", "workspace-tool-calls", "needs-permission", "menu-chat-tab"], "Transcript, permission state and workspace header need current native review.")),
    ("composer", ("Composer", ["create", "create-repo-picker", "menu-model-picker", "empty-model-search", "menu-review-edit"], "These states cover create and picker controls, not the full workspace composer.")),
    ("diff-changes", ("Diff / changes", ["diff-unified", "diff-split", "diff-entire-file", "menu-changes-file"], "All files, Checks and current native diff review remain separate requirements.")),
    ("settings", ("Settings pages", [], "Only local settings are in scope. Per-page captures do not prove native final parity.")),
    ("open-in", ("Open in", [], "No dedicated paired state in this map. Static evidence is not a visual match.")),
    ("palette", ("Command palette", [], "Threshold matches are retained evidence, not a current native final-review verdict.")),
    ("dialogs", ("Dialogs", [], "Captured dialogs are a subset. Onboarding and unlocated dialogs remain separately visible.")),
])


def counts(rows):
    counter = Counter(row["status"] for row in rows)
    return OrderedDict(total=len(rows), **{status: counter[status] for status in STATUSES})


def summary(states, items, requirements=()):
    rows = list(states) + list(items) + list(requirements)
    result = counts(rows)
    result.update(states=counts(states), items=counts(items), requirements=counts(requirements))
    result["items_by_kind"] = OrderedDict((kind, counts([row for row in items if row["kind"] == kind])) for kind in sorted({row["kind"] for row in items}))
    result["by_team"] = OrderedDict((team, counts([row for row in rows if row["team"] == team])) for team in sorted({row["team"] for row in rows}))
    result["located_items"] = sum(bool(row.get("state")) for row in items)
    result["items_with_reference_screenshot"] = sum(bool(row.get("reference_screenshot")) for row in items)
    return result


def annotate(row, state=False):
    row["raw_status"], row["raw_why"] = row["status"], row["why"]
    reference = row.get("reference", {})
    path = reference.get("path") if state else row.get("route") or row.get("route_guess") or row.get("name") or ""
    cloud = row["team"] in ("cloud-org", "routines") or CLOUD_PATH.search(path or "") or row.get("state") in ("settings-ports", "route-cloud-collab-onboarding", "route-new-member-onboarding")
    if cloud:
        row.update(scope="deferred", scope_reason="Cloud UI not in scope. Existing implementation and raw evidence retained.")
    elif row["team"] == "triage":
        row.update(scope="deferred", scope_reason="Unassigned extracted inventory excluded from this main-screen denominator.")
    elif row.get("kind") == "toast" and not (row.get("observed_in_reference") and (row.get("state") or "").startswith("toast-")):
        row.update(scope="not-required", scope_reason="No dedicated toast observation. Not a missing parity requirement; raw copy assessment retained.")
    else:
        row.update(scope="in-scope", scope_reason="Local main-screen parity requirement.")
    observed = reference.get("status") == "captured" if state else row.get("observed_in_reference", False)
    if row["status"] != "matches" and not observed:
        row.update(status="unverified", why="No valid reference observation proves this gap. Raw assessment: " + row["raw_why"])
    row["verification"] = "retained capture, not a fresh final review" if row["status"] == "matches" else "observed gap" if observed else "unverified"


def rescore(doc):
    doc["raw_summary"] = doc["summary"]
    for row in doc["states"]:
        annotate(row, state=True)
    for row in doc["items"]:
        annotate(row)
    doc["requirements"] = [{
        "id": "toast-system", "kind": "system", "name": "Toast system", "team": "shell", "scope": "in-scope",
        "scope_reason": "One shared toast system plus main-flow observable toasts, not every extracted error string.",
        "status": "unverified", "why": "Retained toast images support appearance only. Component, placement, timing and look need one combined verification record.",
        "facets": {key: "unverified" for key in ("component", "placement", "timing", "look")},
        "evidence_states": [row["id"] for row in doc["states"] if row["id"].startswith("toast-") and row["scope"] == "in-scope"],
    }, {
        "id": "deferred-ui-default-off", "kind": "system", "name": "Deferred UI default-off gate", "team": "shell", "scope": "in-scope",
        "scope_reason": "Deferred implementation stays behind an Experimental setting, off by default.",
        "status": "unverified", "why": "Verify native default-off gating and persisted Experimental opt-in for Routines, team, triage and organization entry points. Browser-only proof, when available, is recorded separately as supplemental evidence.",
    }]
    for requirement in doc["requirements"]:
        requirement["supplemental_evidence"] = [record["id"] for record in doc.get("supplemental_evidence", {}).get("records", []) if requirement["id"] in record.get("requirement_ids", [])]
    included_states = [row for row in doc["states"] if row["scope"] == "in-scope"]
    included_items = [row for row in doc["items"] if row["scope"] == "in-scope"]
    doc["summary"] = summary(included_states, included_items, doc["requirements"])
    excluded = [row for row in doc["states"] + doc["items"] if row["scope"] != "in-scope"]
    doc["excluded_summary"] = dict(total=len(excluded), by_scope={scope: counts([row for row in excluded if row["scope"] == scope]) for scope in ("deferred", "not-required")}, by_reason=dict(Counter(row["scope_reason"] for row in excluded)))
    doc["scope"] = dict(version="2026-11-06-local-main-screens", excluded_teams=["triage", "routines", "cloud-org"], cloud_runtime="Reason alone spans the local Mac and a Reason cloud computer in one chat. Claude Code and Codex stay local.", final_review="Track D repeats current native side-by-side review after builder changes until a pass finds nothing material.", denominator="In-scope retained states and inventory items, plus toast-system and default-off-gate requirements. This is an evidence queue, not a feature completion percentage.")
    doc["schema"] = "openconductor.ui-map/2"
    doc["main_screens"] = OrderedDict()
    for key, (title, identifiers, gap) in SCREEN_STATES.items():
        rows = [row for row in included_states if row["id"] in identifiers or key == "settings" and row["id"].startswith("settings-") or key == "palette" and row["id"].startswith("palette-") or key == "dialogs" and (row["id"].startswith("dialog-") or row["id"] in ("onboarding-signed-out", "first-run-onboarding", "login"))]
        evidence_verdict = "unverified" if not rows else "partial" if any(row["status"] != "matches" for row in rows) or key in ("sidebar", "composer") else "harness-only"
        doc["main_screens"][key] = dict(title=title, evidence_verdict=evidence_verdict, final_review="unverified", counts=counts(rows), state_ids=[row["id"] for row in rows], gap=gap)
        doc["main_screens"][key]["supplemental_evidence"] = [record["id"] for record in doc.get("supplemental_evidence", {}).get("records", []) if key in record["areas"]]
        update = doc.get("supplemental_evidence", {}).get("screen_updates", {}).get(key, {})
        doc["main_screens"][key]["area_verdict"] = update.get("area_verdict", evidence_verdict)
        doc["main_screens"][key]["gap"] = update.get("gap", gap)
    return doc


def write_html(doc, root):
    rows = doc["states"] + doc["items"] + doc["requirements"]
    fields = ("id", "title", "name", "team", "status", "scope", "why", "raw_status", "openconductor_screenshot", "reference_screenshot")
    compact = [{**{key: row[key] for key in fields if key in row}, "image": (row.get("openconductor") or {}).get("file") or (row.get("reference") or {}).get("file")} for row in rows]
    for row in compact:
        candidates = [row.get(key) for key in ("image", "openconductor_screenshot", "reference_screenshot")]
        row["image"] = next((path for path in candidates if path and (Path(root) / "parity" / path).is_file()), None)
        row.pop("openconductor_screenshot", None)
        row.pop("reference_screenshot", None)
    payload = json.dumps(compact, ensure_ascii=False).replace("</", "<\\/")
    s = doc["summary"]
    cards = "".join(f'<div class="metric"><strong>{s[key]}</strong><span>{label}</span></div>' for key, label in (("total", "In scope"), ("matches", "Retained matches"), ("wrong", "Observed wrong"), ("missing", "Observed missing"), ("unverified", "Unverified")))
    screens = "".join(f'<article><div class="eyebrow">{escape(screen["area_verdict"])}</div><h3>{escape(screen["title"])}</h3><p>{screen["counts"]["matches"]} / {screen["counts"]["total"]} retained state matches ({escape(screen["evidence_verdict"])})</p><p class="muted">{escape(screen["gap"])}</p><span class="pill">Final review unverified</span></article>' for screen in doc["main_screens"].values())
    reasons = "".join(f'<li><strong>{number}</strong> {escape(reason)}</li>' for reason, number in doc["excluded_summary"]["by_reason"].items())
    supplemental = doc.get("supplemental_evidence", {})
    supplements = ""
    if supplemental:
        supplements = '<h2>Supplemental evidence</h2><p class="muted">Ledger reconciled against main <code>' + escape(supplemental["source_main_commit"]) + '</code>. This is not a new capture identity. These records do not change full-state scores, the denominator or native final review.</p>'
        if supplemental.get("batch_notes"):
            supplements += '<h3>Delivery and proof boundaries</h3><ul>' + ''.join('<li>' + escape(note) + '</li>' for note in supplemental["batch_notes"]) + '</ul>'
        for record in supplemental["records"]:
            url = "https://github.com/reason-machines/openconductor/blob/" + record["merge_commit"] + "/" + record["evidence_path"]
            limits = "".join('<li>' + escape(limit) + '</li>' for limit in record["limits"])
            supplements += '<article><div class="eyebrow">' + escape(record["verdict"]) + ' / ' + escape(", ".join(record["areas"])) + '</div><h3>' + escape(record["id"]) + '</h3><p>' + escape(record["summary"]) + '</p><p class="muted">' + escape(record["lane"]) + '</p><p><a href="' + escape(record["pr_url"], quote=True) + '">Merged PR</a> · <a href="' + escape(url, quote=True) + '">Evidence and capture manifest</a></p><ul>' + limits + '</ul></article>'
    html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenConductor parity ledger</title><style>
*{{box-sizing:border-box}}body{{margin:0;font-family:var(--font-sans,system-ui);color:var(--foreground);background:var(--background);line-height:1.5}}header{{padding:8px 0 24px}}h1{{font-size:28px;font-weight:500;letter-spacing:-.03em;margin:8px 0}}h2{{font-size:20px;font-weight:500;margin:32px 0 16px}}h3{{font-size:17px;font-weight:500;margin:8px 0}}p{{margin:8px 0}}.muted,.eyebrow{{color:var(--muted-foreground)}}.eyebrow{{font-size:12px;text-transform:uppercase;letter-spacing:.08em}}.metrics{{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}}.metric{{padding:16px 0;border-top:2px solid var(--border)}}.metric strong{{font-size:30px;font-weight:500;display:block;font-variant-numeric:tabular-nums}}.metric span{{font-size:12px;color:var(--muted-foreground)}}.notice{{border-left:3px solid var(--chart-2);padding:8px 16px;background:var(--muted);margin:16px 0}}.screens{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}article{{border:1px solid var(--border);border-radius:8px;padding:16px}}article p{{font-size:13px}}.pill{{font-size:11px;border:1px solid var(--border);border-radius:12px;padding:3px 8px;display:inline-block;margin-top:8px}}.controls{{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}}input,select{{background:var(--background);color:var(--foreground);border:1px solid var(--border);padding:8px 12px;border-radius:8px;font:inherit}}input{{flex:1;min-width:180px}}table{{width:100%;border-collapse:collapse;font-size:12px}}th,td{{text-align:left;padding:10px 8px;border-bottom:1px solid var(--border);vertical-align:top}}th{{color:var(--muted-foreground);font-weight:500}}td small{{display:block;color:var(--muted-foreground);margin-top:4px}}code{{font:11px var(--font-mono,monospace);overflow-wrap:anywhere}}a{{color:var(--chart-1)}}ul{{padding-left:20px}}li{{margin:8px 0}}footer{{margin:32px 0;color:var(--muted-foreground);font-size:12px}}.scroll{{overflow:auto;max-height:600px}}@media(max-width:600px){{.screens{{grid-template-columns:1fr}}.metrics{{grid-template-columns:repeat(3,1fr)}}}}
</style></head><body><header><div class="eyebrow">Conductor Rebuild / evidence ledger / 6 November 2026</div><h1>Local parity, without the inflated denominator</h1><p class="muted">Conductor 0.87.6 evidence retained from its real Mac binary. No fresh capture or final-review completion is claimed by this rescore.</p></header><section class="metrics">{cards}</section><div class="notice">A retained match means the recorded capture passed the existing pixel and copy threshold. It does not mean the current native apps match side by side. Track D has not signed off any main screen here.</div><p class="muted">Raw inventory retained unchanged: {doc["raw_summary"]["total"]} rows, {doc["raw_summary"]["matches"]} raw matches. The rescored queue adds two system requirements and excludes {doc["excluded_summary"]["total"]} rows. This is not a feature completion percentage.</p><h2>Main-screen verdicts</h2><section class="screens">{screens}</section>{supplements}<h2>Deferred and not required</h2><ul>{reasons}</ul><p>Cloud UI is not in scope. Already merged cloud code is retained; this ledger does not authorize its removal. Reason local-to-cloud runtime remains in scope. Claude Code and Codex run only on the Mac.</p><h2>Required default-off gate</h2><p>Routines, team, triage and organization entry points must be hidden by default. Their retained code is available only behind an explicit Experimental setting. Native verification remains unrecorded. Merged browser-only proof, when available, is listed separately in supplemental evidence.</p><h2>Toast system</h2><p>One combined component, placement, timing and look check remains unverified. Observable copied-link and other already captured main-flow toasts stay in the queue. Unobservable error strings are not missing work.</p><h2>Retained evidence queue</h2><p class="muted">Filter every row, including exclusions. Raw assessments remain available beside rescored results.</p><div class="controls"><input id="query" aria-label="Search evidence" placeholder="Search a state, copy or owner"><select id="scope" aria-label="Scope"><option value="in-scope">In scope</option><option value="all">All retained rows</option><option value="deferred">Deferred</option><option value="not-required">Not required</option></select><select id="status" aria-label="Status"><option value="all">All statuses</option><option>matches</option><option>wrong</option><option>missing</option><option>unverified</option></select></div><p id="count" class="muted"></p><div class="scroll"><table><thead><tr><th>Requirement</th><th>Verdict</th><th>Evidence / limit</th></tr></thead><tbody id="rows"></tbody></table></div><footer>Source kept in parity/ui-program/ledger.html. Generated by tools/ui-map/build_map.py. Reused captures include mocked Chromium and older built-app lanes; per-state provenance is in the machine-readable map. No real user repositories or data were changed.</footer><script>
const data={payload};const query=document.getElementById('query'),scope=document.getElementById('scope'),status=document.getElementById('status');
function render(){{const filtered=data.filter(r=>(scope.value==='all'||r.scope===scope.value)&&(status.value==='all'||r.status===status.value)&&JSON.stringify(r).toLowerCase().includes(query.value.toLowerCase()));document.getElementById('count').textContent=filtered.length+' rows';const target=document.getElementById('rows');target.replaceChildren();for(const r of filtered){{const tr=document.createElement('tr');const name=document.createElement('td');name.textContent=r.title||r.name||r.id;const id=document.createElement('small');id.textContent=r.id+' · '+r.team;name.append(id);const verdict=document.createElement('td');verdict.textContent=r.status;const raw=document.createElement('small');raw.textContent=r.scope+(r.raw_status?' · raw '+r.raw_status:'');verdict.append(raw);const evidence=document.createElement('td');evidence.textContent=r.why;const path=r.image;if(path){{const a=document.createElement('a');a.textContent=' Retained image';a.href='https://github.com/reason-machines/openconductor/blob/main/parity/'+path;a.target='_blank';a.rel='noopener';evidence.append(a)}}tr.append(name,verdict,evidence);target.append(tr)}}}}
for(const el of [query,scope,status])el.addEventListener('input',render);render();
</script></body></html>'''
    path = Path(root) / "parity/ui-program/ledger.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html)
