#!/usr/bin/env python3
"""Join the UI inventory with both capture lanes and the REA diffs into the
parity work queue: parity/ui-map.json and parity/ui-map.md.

    python3 tools/ui-map/build_map.py

Inputs (all under parity/ui-map/ unless noted):
  inventory.json      tools/ui-map/extract_inventory.py (Conductor's bundle)
  ref-captures.json   tools/ui-map/capture_ref.mjs (REA capture-browser-scenario)
  oc-captures.json    tools/ui-map/oc_lane.mjs (built app via tauri-driver)
  compare.json        tools/ui-map/compare.mjs (REA compare-web-screenshots)
  tools/ui-map/states.json

Status, per state and per item, from what the running apps showed:
  matches  reference rendered and reached, OpenConductor reached the same
           state, the item's copy is on screen in both, and the whole state
           differs by at most MATCH_RATIO changed pixels at channel threshold 24.
  wrong    OpenConductor shows it (copy found in a capture of the running
           app) but it is not shown to match: the visual diff is over the bar,
           the copy differs, or no valid reference render exists to prove it.
  missing  OpenConductor has no way to reach the state, shows a different
           screen there (under 25% of the reference's UI copy), or the item's
           copy is in no capture of the running app.
"""
import json
import os
import re
from collections import Counter, OrderedDict, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
OUT = os.environ.get("UIMAP_OUT", os.path.join(ROOT, "parity/ui-map"))
MATCH_RATIO = 0.05
COPY_BAR = 0.9

# Invented harness data on either side: never counted as UI copy.
SEED = {
    "tide-web", "tide-api", "dotfiles", "ada demo", "ada demo's mac", "my mac", "ada-demo", "moscow", "lisbon", "osaka",
    "quito", "tallinn", "bergen", "main", "today", "yesterday", "conductor-playground", "openconductor-playground",
}
CITY = re.compile(r"^(ada/|[a-z]+$)")


def load(name, default=None):
    p = os.path.join(OUT, name)
    return json.load(open(p)) if os.path.exists(p) else default


def norm(s):
    s = (s or "").replace("OpenConductor", "Conductor").replace("openconductor", "conductor")
    s = re.sub(r"[\u2018\u2019]", "'", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s.rstrip(".:!?… ")


UI_STRINGS = set()


def is_ui_copy(t):
    """Rendered text that is one of Conductor's own UI string literals (not seed data)."""
    n = norm(t)
    if UI_STRINGS and n not in UI_STRINGS:
        return False
    if len(n) < 3 or not re.search(r"[a-z]{3}", n):
        return False
    if n in SEED or n.startswith("ada/") or "tide-" in n or "/home/" in n or "/users/" in n:
        return False
    if re.fullmatch(r"[\d\s+\-/:.,%]+[a-z]{0,2}", n):
        return False
    return True


def blob(dom):
    if not dom:
        return ""
    return "\n" + "\n".join(norm(x) for x in (dom.get("texts", []) + dom.get("labels", []))) + "\n"


def seen(p, b):
    """Long phrases match as substrings of the screen text; short ones must be a whole text node or label."""
    if not p or not b:
        return False
    return (p in b) if len(p) >= 16 else ("\n" + p + "\n") in b


def probe(copy):
    """The longest literal piece of a copy string, for substring matching."""
    if not copy:
        return None
    parts = re.split(r"\$\{[^}]*\}|\{[^}]*\}|\$\{.*", copy)
    parts = [norm(p) for p in parts]
    parts = [p for p in parts if len(p) >= 4 and re.search(r"[a-z]{3}", p)]
    return max(parts, key=len) if parts else None


# Owning team: a default assignment by area so every row has an owner on day one.
# Rules run in order over the item's route, settings page, host state, id, name and copy;
# the coordinator reassigns by editing TEAM_RULES. Teams: shell, workspaces, chat,
# git-review, terminal-scripts, settings, cloud-org, routines, onboarding-auth, and triage
# for items with nothing to place them by (no route, page, state or copy).
TEAM_RULES = [
    # The sidebar footer's Help menu and what it opens (Submit a prompt, /diagnostics).
    ("shell", r"\bdiagnostics\b|submit[ -]a[ -]prompt|^help > "),
    ("onboarding-auth", r"onboarding|\blogin\b|sign[ -]?in|sign[ -]?out|signed-out|log ?out"),
    ("routines", r"routine|automation|webhook|trigger"),
    ("cloud-org", r"organi[sz]ation|\bteam\b|teammate|cloud|member|invite|\bshare|sharing|\bseat|billing|subscription|\bplan\b"),
    ("settings", r"^settings|display name|setting:|settings-|/settings|preference|key-?bindings?|appearance|\btheme\b"),
    ("git-review", r"\bdiff|changes? to this file|\bgit\b|github|pull request|\bpr\b|\bmerge|\bbranch|commit|\bpush|rebase|checks?\b|review|conflict"),
    # \bscripts?\b, not "script": "transcript" and "description" are chat and PR copy.
    ("terminal-scripts", r"terminal|\bscripts?\b|\bport|\brun\b|setup command|archive script|\bshell\b"),
    ("chat", r"\bchat|composer|message|model|prompt|permission|tool[ -]call|\bplan mode|agent|claude|codex|thinking|attach|fast mode|sending|\binput\b|transcript|\bmcp\b"),
    ("workspaces", r"workspace|repositor|\brepo|project|worktree|\bclone|\bcreate\b|archive"),
]

def owning_team(it, host):
    import re
    fields = [it.get("route") or it.get("route_guess") or "", ("settings-" + it["page"]) if it.get("page") else "",
              it.get("kind") == "settings-page" and "settings" or "", host or "", it.get("id") or "", it.get("name") or ""]
    fields += list((it.get("copy") or [])[:3])
    hay = " | ".join(str(f) for f in fields).lower()
    for team, rx in TEAM_RULES:
        if re.search(rx, hay):
            return team
    # No route, page, host state or copy to place it by: left for the coordinator to assign.
    if not (it.get("name") or (it.get("copy") or []) or host or it.get("route") or it.get("page")):
        return "triage"
    return "shell"


def main():
    spec = json.load(open(os.path.join(HERE, "states.json")))
    inv = load("inventory.json")
    ref = load("ref-captures.json", {})
    oc = load("oc-captures.json", {})
    cmp_ = (load("compare.json", {}) or {}).get("results", {})
    UI_STRINGS.update(norm(x) for x in inv.get("ui_strings", []))
    # Side-by-side records (tools/side-by-side/*.mjs, UIMAP_RECORD): both sides captured
    # with REA in one run after a fix, for a state the UI map lane has not re-captured
    # since. A record applies while the lane's OpenConductor capture of the state is the
    # one it superseded (or there is none); a newer lane capture wins.
    sbs = (load("side-by-side.json", {}) or {}).get("states", {})
    sbs_used = {}
    for sid, rec in sbs.items():
        if (oc.get(sid) or {}).get("png_sha256") != rec.get("supersedes_oc_png_sha256"):
            continue
        sbs_used[sid] = rec
        ref[sid] = dict(status="captured", link=rec["image"], dom=rec["reference"]["dom"],
                        rea=dict(evidence_id=rec["reference"]["evidence_id"], final_url=rec["reference"].get("final_url")),
                        actions_run=None, actions_total=None)
        oc[sid] = dict(status="captured", link=rec["image"], dom=rec["openconductor"]["dom"], png_sha256=rec["openconductor"]["png_sha256"])
        cmp_[sid] = rec["compare"]

    # ---------- states
    states = OrderedDict()
    for st in spec["states"]:
        sid = st["id"]
        r = ref.get(sid, {})
        o = oc.get(sid, {})
        c = cmp_.get(sid, {})
        # A state whose route Conductor itself redirects (e.g. /settings/organization/github → /computer)
        # names where the reference should land as ref.expect_path.
        want_path = (st.get("ref") or {}).get("expect_path") or (st.get("ref") or {}).get("path", "/")
        final = ((r.get("rea") or {}).get("final_url") or "")
        final_path = re.sub(r"^https?://[^/]+", "", final).split("?")[0]
        ref_status = r.get("status", "not-run")
        if ref_status == "captured" and want_path != "/" and final_path and final_path != want_path:
            ref_status = "redirected"
        ref_ok = ref_status == "captured"
        oc_status = o.get("status", "not-run")
        oc_ok = oc_status == "captured"
        ref_texts = [t for t in (r.get("dom") or {}).get("texts", []) + (r.get("dom") or {}).get("labels", []) if is_ui_copy(t)]
        ref_texts = list(OrderedDict.fromkeys(norm(t) for t in ref_texts))
        ob = blob(o.get("dom"))
        found = [t for t in ref_texts if t in ob]
        coverage = round(len(found) / len(ref_texts), 3) if ref_texts and oc_ok else None
        t24 = (c.get("t24") or {}).get("changed_ratio")
        t0 = (c.get("t0") or {}).get("changed_ratio")
        if not oc_ok:
            status, why = "missing", o.get("reason") or o.get("error") or "not reached in OpenConductor"
        elif ref_ok and coverage is not None and coverage < 0.25:
            status, why = "missing", "OpenConductor shows a different screen here (copy %d%%, diff %.1f%% at t24)" % (round(coverage * 100), (t24 or 0) * 100)
        elif ref_ok and t24 is not None and t24 <= MATCH_RATIO and (coverage or 0) >= COPY_BAR:
            status, why = "matches", "diff %.1f%% at t24, copy %d%%" % (t24 * 100, coverage * 100)
        else:
            bits = []
            if not ref_ok:
                bits.append("no valid reference render (%s%s)" % (ref_status, (" to " + final_path) if ref_status == "redirected" else ""))
            if t24 is not None:
                bits.append("diff %.1f%% at t24" % (t24 * 100))
            if coverage is not None and ref_ok:
                bits.append("copy %d%%" % round(coverage * 100))
            status, why = "wrong", ", ".join(bits)
        states[sid] = OrderedDict(
            id=sid, title=st["title"], status=status, why=why,
            team=owning_team({"id": sid, "name": st["title"], "route": want_path if want_path != "/" else ""}, sid),
            reference=OrderedDict(
                status=ref_status, file=r.get("link") or (("ui-map/" + r["file"]) if r.get("file") else None), path=want_path,
                final_path=final_path or None, scenario=(st.get("ref") or {}).get("scenario"),
                actions_run=r.get("actions_run"), actions_total=r.get("actions_total"), error=r.get("error"),
                rea_evidence_id=(r.get("rea") or {}).get("evidence_id")),
            openconductor=OrderedDict(
                status=oc_status, file=o.get("link") or (("ui-map/" + o["file"]) if o.get("file") else None),
                error=o.get("error") or o.get("reason"),
                note=("side-by-side lane at %s: %s" % (sbs_used[sid].get("openconductor_commit"), sbs_used[sid]["lane"])) if sid in sbs_used else st.get("oc_note")),
            diff=OrderedDict(
                # compare.mjs writes the image for every pair it scores; the images are not committed.
                file=None if sid in sbs_used else ("ui-map/diff/%s.jpg" % sid) if (c or os.path.exists(os.path.join(OUT, "diff", sid + ".jpg"))) else None,
                changed_ratio_t0=t0, changed_ratio_t24=t24,
                rea_evidence_ids=[x for x in [(c.get("t0") or {}).get("evidence_id"), (c.get("t24") or {}).get("evidence_id")] if x]),
            copy_coverage=coverage,
            copy_missing=[t for t in ref_texts if t not in found][:40] if oc_ok and ref_ok else None,
        )

    ref_blobs = {sid: blob(ref.get(sid, {}).get("dom")) for sid in states if states[sid]["reference"]["status"] == "captured"}
    oc_blobs = {sid: blob(oc.get(sid, {}).get("dom")) for sid in states if states[sid]["openconductor"]["status"] == "captured"}

    covers = defaultdict(list)
    for st in spec["states"]:
        for cv in st.get("covers", []):
            covers[(cv["kind"], cv["name"])].append(st["id"])
    page_state = {}
    for st in spec["states"]:
        for cv in st.get("covers", []):
            if cv["kind"] == "settings-page":
                page_state[cv["name"]] = st["id"]

    # ---------- items
    items = []
    for it in inv["items"]:
        kind = it["kind"]
        copy = [c for c in (it.get("copy") or []) if c]
        if kind in ("dialog", "sheet", "toast", "empty-state", "tab", "menu-item") and it.get("name"):
            copy = [it["name"]] + [c for c in copy if c != it["name"]]
        probes = [p for p in (probe(c) for c in copy) if p]
        host = None
        basis = None
        if kind == "route":
            hs = covers.get(("route", it["name"])) or []
            host = hs[0] if hs else None
            basis = "route state" if host else "no state captures this route"
        elif kind in ("settings-page",):
            host = page_state.get(it["name"]) or page_state.get("repo-" + it["name"])
            basis = "settings page state" if host else "no state for this page"
        elif kind == "settings-row":
            user_page = page_state.get(it["page"]) if "user" in (it.get("scopes") or []) else None
            host = user_page or page_state.get("repo-" + it["page"]) or page_state.get(it["page"])
            basis = "settings page state"
        if host is None and kind not in ("route", "settings-page", "settings-row") and covers.get((kind, it.get("name"))):
            host = covers[(kind, it["name"])][0]
            basis = "state covers it"
        if host is None and probes:
            for sid, b in ref_blobs.items():
                if seen(probes[0], b):
                    host = sid
                    basis = "copy seen in reference capture"
                    break
        hs = states.get(host) if host else None
        ref_has = bool(probes) and seen(probes[0], ref_blobs.get(host))
        oc_in_host = bool(probes) and seen(probes[0], oc_blobs.get(host))
        oc_any = [sid for sid, b in oc_blobs.items() if probes and seen(probes[0], b)]
        if kind in ("route", "settings-page"):
            st_status = hs["status"] if hs else "missing"
            if hs is None:
                status, why = "missing", basis
            else:
                status, why = st_status, hs["why"]
        elif not probes:
            status, why = "missing", "no literal copy to locate it; not observed in any capture"
            if hs and hs["status"] == "missing":
                why = "host state not reachable in OpenConductor"
        elif not oc_any:
            status, why = "missing", "copy not shown in any OpenConductor capture"
        elif ref_has and oc_in_host and hs["status"] == "matches":
            status, why = "matches", "on screen in both; state %s matches" % host
        else:
            reasons = []
            if not ref_has:
                reasons.append("not rendered in a reference capture")
            if not oc_in_host:
                reasons.append("OpenConductor shows it in %s, not in the host state" % ", ".join(oc_any[:3]))
            if hs and hs["status"] != "matches":
                reasons.append("host state %s is %s" % (host, hs["status"]))
            status, why = "wrong", "; ".join(reasons)
        rec = OrderedDict(
            id=it["id"], kind=kind, name=it.get("name"), status=status, why=why,
            team=owning_team(dict(it, copy=copy), host),
            component=it.get("component"), source=it.get("source"),
            copy=copy[:6], tokens=it.get("tokens") or [],
            state=host, state_basis=basis,
            reference_screenshot=hs["reference"]["file"] if hs and ref_has else (hs["reference"]["file"] if hs and kind in ("route", "settings-page", "settings-row") else None),
            openconductor_screenshot=hs["openconductor"]["file"] if hs else None,
            diff=hs["diff"]["file"] if hs else None,
            changed_ratio_t24=hs["diff"]["changed_ratio_t24"] if hs else None,
        )
        for k in ("primitive", "variant", "page", "setting_key", "row_id", "scopes", "route", "route_guess", "rows", "dynamic"):
            if k in it:
                rec[k] = it[k]
        items.append(rec)

    st_counts = Counter(s["status"] for s in states.values())
    it_counts = Counter(i["status"] for i in items)
    by_kind = defaultdict(Counter)
    for i in items:
        by_kind[i["kind"]][i["status"]] += 1
    team_counts = defaultdict(Counter)
    for x in list(states.values()) + items:
        team_counts[x["team"]][x["status"]] += 1
    summary = OrderedDict(
        total=len(items) + len(states),
        missing=it_counts["missing"] + st_counts["missing"],
        wrong=it_counts["wrong"] + st_counts["wrong"],
        matches=it_counts["matches"] + st_counts["matches"],
        states=OrderedDict(total=len(states), **{k: st_counts[k] for k in ("missing", "wrong", "matches")}),
        items=OrderedDict(total=len(items), **{k: it_counts[k] for k in ("missing", "wrong", "matches")}),
        items_by_kind=OrderedDict((k, OrderedDict(total=sum(v.values()), **{s: v[s] for s in ("missing", "wrong", "matches")})) for k, v in sorted(by_kind.items())),
        by_team=OrderedDict((t, OrderedDict(total=sum(v.values()), **{x: v[x] for x in ("missing", "wrong", "matches")}))
                            for t, v in sorted(team_counts.items())),
        located_items=sum(1 for i in items if i["state"]),
        items_with_reference_screenshot=sum(1 for i in items if i["reference_screenshot"]),
    )
    doc = OrderedDict(
        schema="openconductor.ui-map/1",
        conductor=inv["source"],
        openconductor=OrderedDict(commit=os.environ.get("UIMAP_OC_COMMIT"), lane="debug build, tauri-driver + WebKitWebDriver under Xvfb (tests/e2e lane)", viewport=spec["viewport"], theme=spec["theme"]),
        rules=OrderedDict(match_ratio_t24=MATCH_RATIO, copy_bar=COPY_BAR, statuses=__doc__.split("Status, per state and per item")[1].strip()),
        summary=summary,
        states=list(states.values()),
        items=items,
    )
    with open(os.path.join(ROOT, "parity/ui-map.json"), "w") as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
        f.write("\n")
    write_md(doc)
    print(json.dumps(summary["states"]), json.dumps(summary["items"]))


def esc(s):
    return (s or "").replace("|", "\\|").replace("\n", " ")


def write_md(doc):
    s = doc["summary"]
    L = []
    L.append("# UI map: Conductor vs OpenConductor\n")
    L.append("The parity work queue for the UI. Every screen, route, panel, dialog, menu, popover, toast, empty state and settings page and row found in Conductor's extracted frontend, with a Conductor reference screenshot, an OpenConductor screenshot from the built app, a REA visual diff and a status. Generated by `tools/ui-map/build_map.py`; do not edit by hand. Machine-readable: [ui-map.json](ui-map.json).\n")
    L.append("%s, chunks %s. OpenConductor at `%s`, %s, %dx%d, %s theme.\n" % (
        doc["conductor"]["app"], ", ".join("`%s` (`%s`)" % (c["name"], c["sha256"][:12]) for c in doc["conductor"]["chunks"]),
        doc["openconductor"]["commit"] or "?", doc["openconductor"]["lane"], doc["openconductor"]["viewport"]["width"], doc["openconductor"]["viewport"]["height"], doc["openconductor"]["theme"]))
    L.append("## Summary\n")
    L.append("| | Total | Missing | Wrong | Matches |\n|---|---:|---:|---:|---:|")
    L.append("| **All** | **%d** | **%d** | **%d** | **%d** |" % (s["total"], s["missing"], s["wrong"], s["matches"]))
    L.append("| States (captured screens) | %d | %d | %d | %d |" % (s["states"]["total"], s["states"]["missing"], s["states"]["wrong"], s["states"]["matches"]))
    L.append("| Inventory items | %d | %d | %d | %d |" % (s["items"]["total"], s["items"]["missing"], s["items"]["wrong"], s["items"]["matches"]))
    for k, v in s["items_by_kind"].items():
        L.append("| &nbsp;&nbsp;%s | %d | %d | %d | %d |" % (k, v["total"], v["missing"], v["wrong"], v["matches"]))
    L.append("\n### By owning team\n")
    L.append("Default owner by area (`TEAM_RULES` in `tools/ui-map/build_map.py`; reassign there and regenerate). Counts include states and items.\n")
    L.append("| Team | Total | Missing | Wrong | Matches |\n|---|---:|---:|---:|---:|")
    for t, v in s["by_team"].items():
        L.append("| %s | %d | %d | %d | %d |" % (t, v["total"], v["missing"], v["wrong"], v["matches"]))
    L.append("\n%d of %d items were located in a captured state; %d have a reference screenshot of the state they appear in. The rest are listed from the bundle but were not observed on screen in either app (error toasts, dialogs behind server state, cloud and organization features); they are counted missing because their copy is in no OpenConductor capture, but most were not rendered in the reference either, so that status is unverified on screen until a state that shows them is added to `tools/ui-map/states.json`.\n" % (s["located_items"], s["items"]["total"], s["items_with_reference_screenshot"]))
    L.append("## How it was measured\n")
    L.append("- **Inventory**: `tools/ui-map/extract_inventory.py` over Conductor's decoded Tauri asset table (`renderApp`, `index` chunks). Routes from TanStack route definitions; dialogs, sheets, menus, tabs, selects from Radix/Base UI components named by `displayName`; toasts from sonner calls; popovers from popover-surface classes; empty states from their copy; settings pages and rows from [evidence/settings/settings-registry.json](../evidence/settings/settings-registry.json) (REA-extracted). Copy is untrusted data, kept for matching only.")
    L.append("- **Conductor reference**: `tools/ui-map/capture_ref.mjs` renders the extracted frontend in Chromium through the `tools/screens` harness (Tauri IPC mocked with sql.js databases built from the evidence schemas and synthetic seed rows) and captures each state with REA `capture-browser-scenario` (screenshot, URL, DOM).")
    L.append("- **OpenConductor**: `tools/ui-map/oc_lane.mjs` drives the built debug app (`npx tauri build --debug --no-bundle`) through tauri-driver and WebKitWebDriver under Xvfb, the same lane as `tests/e2e`, on an isolated HOME seeded with repos tide-web, tide-api, dotfiles and one workspace. Window screenshot plus the visible DOM text.")
    L.append("- **Diff**: `tools/ui-map/compare.mjs` runs REA `compare-web-screenshots` at channel thresholds 0 and 24 for every state with both captures; `diff/<state>.jpg` is reference | OpenConductor | changed pixels (threshold 24).")
    L.append("- **Status** (per state, and per item through the state it appears in):")
    L.append("  - **matches**: the reference rendered the state, OpenConductor reached it, the item's copy is on screen in both, at least %d%% of the reference's UI copy is on OpenConductor's screen, and the state differs by at most %d%% of pixels at channel threshold 24." % (COPY_BAR * 100, MATCH_RATIO * 100))
    L.append("  - **wrong**: OpenConductor shows it (its copy is in a capture of the running app) but it is not shown to match: the diff or copy is over the bar, or there is no valid reference render to prove a match.")
    L.append("  - **missing**: OpenConductor has no way to reach the state, shows a different screen there (under 25% of the reference's UI copy), or the item's copy is in no capture of the running app.")
    L.append("- UI copy means rendered strings that are literals in Conductor's bundle (`ui_strings` in inventory.json), so invented seed data (repo, workspace and user names) never counts. The OpenConductor brand name is normalised to Conductor before matching.")
    L.append("- **Side-by-side records** ([ui-map/side-by-side.json](ui-map/side-by-side.json)): a builder who fixes a state captures both apps in that state with REA `capture-browser-scenario` (`tools/side-by-side/*.mjs`, Conductor's extracted frontend in the `tools/screens` harness beside OpenConductor's built frontend in Chromium with Tauri IPC mocked) and scores the pair with REA `compare-web-screenshots`, at the map's viewport. The record stands in for both captures of that state, under the same status rules, until the OpenConductor lane captures the state again; its rows link the committed side-by-side image and name the lane in `openconductor.note`.\n")
    L.append("- Seed data differs between the two sides (the reference harness seeds six workspaces with a transcript; the OpenConductor seed has one real git worktree), so the pixel ratio carries some content difference too. The copy check and the side-by-side images are the better guide to what to fix.\n")
    L.append("## States\n")
    L.append("| State | Status | Team | Why | Reference | OpenConductor | Diff | t24 |\n|---|---|---|---|---|---|---|---:|")
    for st in doc["states"]:
        r = st["reference"]
        o = st["openconductor"]
        d = st["diff"]
        L.append("| %s<br>`%s` | %s | %s | %s | %s | %s | %s | %s |" % (
            esc(st["title"]), st["id"], st["status"], st["team"], esc(st["why"]),
            "[png](%s)" % r["file"] if r["file"] else esc(r["status"]),
            "[png](%s)" % o["file"] if o["file"] else esc(o["status"]),
            "[jpg](%s)" % d["file"] if d["file"] else "",
            "%.1f%%" % (d["changed_ratio_t24"] * 100) if d["changed_ratio_t24"] is not None else ""))
    kinds = OrderedDict()
    for it in doc["items"]:
        kinds.setdefault(it["kind"], []).append(it)
    order = ["route", "settings-page", "settings-row", "dialog", "sheet", "menu", "menu-item", "popover", "select", "tab", "toast", "empty-state"]
    for k in order + [k for k in kinds if k not in order]:
        if k not in kinds:
            continue
        xs = kinds[k]
        c = Counter(i["status"] for i in xs)
        L.append("\n## %s (%d: %d missing, %d wrong, %d matches)\n" % (k, len(xs), c["missing"], c["wrong"], c["matches"]))
        L.append("| Item | Status | Team | Copy | Component | State | Why |\n|---|---|---|---|---|---|---|")
        for i in xs:
            name = i["name"] or ""
            if k == "settings-row":
                name = "%s › %s" % (i.get("page"), i["name"])
            L.append("| `%s`%s | %s | %s | %s | `%s` | %s | %s |" % (
                i["id"], ("<br>" + esc(name[:80])) if name else "", i["status"], i["team"], esc(" / ".join(x[:70] for x in i["copy"][:2])),
                i["component"] or "", ("[%s](%s)" % (i["state"], i["openconductor_screenshot"] or i["reference_screenshot"] or "")) if i["state"] else "", esc(i["why"])))
    gaps = os.path.join(HERE, "REA-GAPS.md")
    if os.path.exists(gaps):
        L.append("\n" + open(gaps).read())
    with open(os.path.join(ROOT, "parity/ui-map.md"), "w") as f:
        f.write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
