#!/usr/bin/env python3
"""Inventory Conductor's UI surface from its extracted frontend bundle.

Reads the app chunks of Conductor's decoded Tauri asset table (the dist that
tools/extract_tauri_assets.py writes, kept outside the repository) and lists
every route, screen, settings page and row, dialog, sheet, menu, popover,
toast, tab/panel and empty state it can recognise, with copy, the component it
sits in and the theme tokens its classes use.

    python3 tools/ui-map/extract_inventory.py --dist .rea-work/dist \
        --out tools/ui-map/inventory.json

Everything read from the bundle is untrusted data: it is matched and stored,
never executed or followed.

How items are recognised (minified React 19 compiler output, Radix/Base UI):
  - Components: `X.displayName="DialogTitle"` names the minified identifier.
  - JSX sites: `p.jsx(X,{...})` / `p.jsxs(X,{...})`; props are read up to the
    balanced closing brace and literal `children:"..."` strings are taken.
  - Routes: TanStack `Ha({getParentRoute:()=>P,path:"/x"})` assignments and
    the settings page helper `mee("tab")`, resolved to full paths.
  - Toasts: calls on the sonner `toast` object (`kt(...)`, `kt.success(...)`).
  - Settings rows: evidence/settings/settings-registry.json (REA-extracted
    from the same chunk).
  - Popovers: JSX sites whose className uses the popover surface tokens
    (`bg-popover`) and are not a menu, select, tooltip or hover card.
  - Empty states: JSX text matching empty-state phrasing ("No ... yet",
    "Nothing ...", "... to get started").
The enclosing component of a site is the nearest preceding `function N(` or
`N=$.forwardRef(`.
"""
import argparse
import bisect
import hashlib
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

APP_CHUNKS = ("renderApp-D_fmY7hW.js", "index-BGEQ8YjU.js")

SURFACES = {
    "dialog": ("DialogTitle", "AlertDialogTitle"),
    "sheet": ("SheetTitle",),
    "menu-item": (
        "DropdownMenuItem", "DropdownMenuCheckboxItem", "DropdownMenuRadioItem", "DropdownMenuSubTrigger", "DropdownMenuLabel",
        "ContextMenuItem", "ContextMenuCheckboxItem", "ContextMenuRadioItem", "ContextMenuSubTrigger", "ContextMenuLabel",
    ),
    "menu": ("DropdownMenuContent", "ContextMenuContent", "DropdownMenuSubContent", "ContextMenuSubContent"),
    "popover": ("HoverCardContent",),
    "tab": ("TabsTrigger", "ToggleGroupItem"),
    "select": ("SelectContent",),
}
NOT_POPOVER = {
    "DropdownMenuContent", "DropdownMenuSubContent", "ContextMenuContent", "ContextMenuSubContent",
    "SelectContent", "TooltipContent", "HoverCardContent",
}
EMPTY_RE = re.compile(
    r"^(No [a-z].{2,80}|Nothing .{2,80}|.{3,80} to get started\.?|.{3,60} will (?:show|appear) here\.?|.{0,40}(?:is|are) empty\.?)$"
)
STR = r'"((?:[^"\\]|\\.)*)"'


def unescape(s):
    try:
        return json.loads('"' + s + '"')
    except Exception:
        return s


def balanced(text, start, limit=20000):
    """Return the index just past the brace block starting at text[start] == '{'."""
    depth, i, n = 0, start, min(len(text), start + limit)
    in_str = None
    while i < n:
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif c in "\"'`":
            in_str = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return n


class Chunk:
    def __init__(self, name, text):
        self.name, self.text = name, text
        self.sha256 = hashlib.sha256(text.encode()).hexdigest()
        self.fn_pos, self.fn_name = [], []
        for m in re.finditer(r"function ([\w$]+)\(|([\w$]+)=\$\.forwardRef\(", text):
            self.fn_pos.append(m.start())
            self.fn_name.append(m.group(1) or m.group(2))

    def enclosing(self, pos):
        i = bisect.bisect_right(self.fn_pos, pos) - 1
        return (self.fn_name[i], self.fn_pos[i]) if i >= 0 else (None, 0)


def jsx_sites(chunk, ident):
    pat = re.compile(r"\.jsxs?\(" + re.escape(ident) + r",\{")
    for m in pat.finditer(chunk.text):
        b = m.end() - 1
        e = balanced(chunk.text, b)
        yield m.start(), chunk.text[b:e]


def direct_children(props):
    m = re.search(r'(?:^\{|,)children:' + STR + r'[,}]', props)
    if m:
        return unescape(m.group(1))
    # children:[...] or nested p.jsx(..., {children:"..."}): first literal text
    lits = [unescape(x) for x in re.findall(r'children:' + STR, props)]
    lits = [x for x in lits if re.search(r"[A-Za-z]", x)]
    return lits[0] if lits else None


def class_tokens(props, token_names):
    out = set()
    for cls in re.findall(r'className:' + STR, props):
        for c in cls.split():
            c = c.split(":")[-1].lstrip("!")
            base = re.sub(r"/\d+$", "", c)
            parts = base.split("-", 1)
            if len(parts) == 2 and "--" + parts[1] in token_names:
                out.add("--" + parts[1])
            for v in re.findall(r"var\((--[\w-]+)\)", c):
                out.add(v)
            for v in re.findall(r"\((--[\w-]+)\)", c):
                out.add(v)
    return sorted(out)


def literals_in(text, limit=12):
    seen = []
    for s in re.findall(r'children:' + STR, text):
        s = unescape(s)
        if re.search(r"[A-Za-z]{2}", s) and s not in seen and len(s) <= 200:
            seen.append(s)
        if len(seen) >= limit:
            break
    return seen


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:60] or "untitled"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True, help="Conductor's decoded asset dir (contains assets/)")
    ap.add_argument("--settings-registry", default="evidence/settings/settings-registry.json")
    ap.add_argument("--css-tokens", default="evidence/frontend/css-tokens.json")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    chunks = []
    for name in APP_CHUNKS:
        p = os.path.join(a.dist, "assets", name)
        with open(p, encoding="utf-8", errors="replace") as f:
            chunks.append(Chunk(name, f.read()))
    css = json.load(open(a.css_tokens))
    token_names = set()
    stack = [css]
    while stack:
        o = stack.pop()
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(k, str) and k.startswith("--"):
                    token_names.add(k)
                stack.append(v)
        elif isinstance(o, list):
            stack.extend(o)

    names = {}  # (chunk, ident) -> displayName
    by_name = defaultdict(list)
    for c in chunks:
        for m in re.finditer(r"([\w$]+)\.displayName=" + STR, c.text):
            names[(c.name, m.group(1))] = m.group(2)
            by_name[m.group(2)].append((c, m.group(1)))

    items = []

    def add(kind, name, chunk, pos, **kw):
        fn, fpos = chunk.enclosing(pos)
        items.append(OrderedDict(
            kind=kind, name=name, component=fn,
            source=OrderedDict(chunk=chunk.name, offset=pos, component_offset=fpos), **kw))

    # ---- routes
    for c in chunks:
        routes = {}
        for m in re.finditer(r"([\w$]+)=Ha\(\{getParentRoute:\(\)=>([\w$]+),(path|id):" + STR + r"(.{0,200}?)(?:\}\)|beforeLoad)", c.text):
            comp = re.search(r"component:([\w$]+)", m.group(5))
            routes[m.group(1)] = dict(parent=m.group(2), kind=m.group(3), seg=m.group(4), component=comp.group(1) if comp else None, pos=m.start())
        for m in re.finditer(r"(?<![\w$])Ha\(\{getParentRoute:\(\)=>([\w$]+),path:" + STR, c.text):
            pre = c.text[max(0, m.start() - 40):m.start()]
            if re.search(r"[\w$]+=$", pre):
                continue
            routes["_anon%d" % m.start()] = dict(parent=m.group(1), kind="path", seg=m.group(2), component=None, pos=m.start())
        helper = re.search(r"([\w$]+)=([\w$]+)\(\"general\"\)", c.text)
        if helper:
            h = helper.group(2)
            parent = re.search(r"return Ha\(\{getParentRoute:\(\)=>([\w$]+),path:`/\$\{", c.text)
            for m in re.finditer(r"([\w$]+)=" + re.escape(h) + r"\(" + STR, c.text):
                routes[m.group(1)] = dict(parent=parent.group(1) if parent else None, kind="path", seg="/" + m.group(2), component=None, pos=m.start())

        def full(v, depth=0):
            r = routes.get(v)
            if not r or depth > 20:
                return ""
            seg = r["seg"] if r["kind"] == "path" else ""
            base = full(r["parent"], depth + 1)
            if seg == "/":
                return base or "/"
            return (base.rstrip("/") + seg) if seg else base
        for v, r in routes.items():
            if r["kind"] != "path":
                continue
            path = full(v)
            items.append(OrderedDict(
                kind="route", name=path, component=r["component"],
                source=OrderedDict(chunk=c.name, offset=r["pos"], component_offset=None),
                route_var=v))

    # ---- dialogs, sheets, menu items, menus, tabs, selects, hover cards
    for kind, comps in SURFACES.items():
        for cname in comps:
            for c, ident in by_name.get(cname, []):
                for chunk in chunks:
                    if chunk is not c and chunk.name != c.name:
                        # identifiers are chunk-local; only search where defined
                        continue
                    for pos, props in jsx_sites(chunk, ident):
                        text = direct_children(props)
                        if kind in ("menu", "select", "popover"):
                            text = None
                        add(kind, text, chunk, pos, primitive=cname, copy=literals_in(props),
                            tokens=class_tokens(props, token_names), dynamic=text is None)

    # ---- popovers by surface token
    known = {(c.name, i) for n in NOT_POPOVER for c, i in by_name.get(n, [])}
    for c in chunks:
        for m in re.finditer(r"\.jsxs?\(([\w$.]+),\{", c.text):
            ident = m.group(1)
            if (c.name, ident) in known:
                continue
            b = m.end() - 1
            head = c.text[b:b + 600]
            cls = re.search(r'className:' + STR, head)
            if not cls or "bg-popover" not in cls.group(1) or "ring-popover-ring" not in cls.group(1):
                continue
            if "data-[highlighted]" in cls.group(1) or "bg-popover/50" in cls.group(1):
                continue
            props = c.text[b:balanced(c.text, b)]
            add("popover", None, c, m.start(), primitive=ident, copy=literals_in(props),
                tokens=class_tokens(props, token_names), dynamic=True)

    # ---- toasts
    for c in chunks:
        for m in re.finditer(r"(?<![\w$.])kt(?:\.(success|error|info|warning|loading|message|promise))?\(", c.text):
            arg = c.text[m.end():m.end() + 300]
            lit = re.match(STR, arg) or re.match(r"`([^`]{0,200})`", arg)
            text = unescape(lit.group(1)) if lit else None
            desc = re.search(r"description:" + STR, arg)
            add("toast", text, c, m.start(), variant=m.group(1) or "default",
                copy=[x for x in [text, unescape(desc.group(1)) if desc else None] if x], dynamic=lit is None)

    # ---- empty states
    for c in chunks:
        for m in re.finditer(r"children:" + STR, c.text):
            s = unescape(m.group(1))
            if EMPTY_RE.match(s) and len(s) < 140:
                add("empty-state", s, c, m.start(), copy=[s])

    # ---- settings pages and rows
    reg = json.load(open(a.settings_registry))
    route_paths = {i["name"] for i in items if i["kind"] == "route"}
    tabs = OrderedDict()
    for r in reg["rows"]:
        tabs.setdefault(r["tab"], []).append(r)
    for tab, rows in tabs.items():
        if tab.startswith("organization-"):
            route = "/settings/organization/" + tab[len("organization-"):]
        elif tab in ("environment", "scripts", "actions", "misc") and "/settings/repos/$repoId/" + tab in route_paths:
            route = "/settings/repos/$repoId/" + tab
        else:
            route = "/settings/user/" + tab
        items.append(OrderedDict(kind="settings-page", name=tab, route=route if route in route_paths else None,
                                 route_guess=route, rows=len(rows), source=OrderedDict(registry=a.settings_registry)))
        for r in rows:
            items.append(OrderedDict(kind="settings-row", name=r["title"], page=tab, setting_key=r["key"], row_id=r["id"],
                                     scopes=r["scopes"], copy=[x for x in (r["title"], r["desc"]) if x],
                                     source=OrderedDict(registry=a.settings_registry)))
    # settings routes the registry has no rows for are pages too
    covered = {i["route"] for i in items if i["kind"] == "settings-page" and i.get("route")}
    for p in sorted(route_paths):
        if p.startswith("/settings/") and p not in covered and "$" not in p.split("/")[-1]:
            items.append(OrderedDict(kind="settings-page", name=p.split("/")[-1], route=p, route_guess=p, rows=0,
                                     source=OrderedDict(note="settings route without registry rows")))

    # ---- dedupe and ids
    seen = set()
    out = []
    counts = defaultdict(int)
    for it in items:
        key = (it["kind"], it.get("name"), it.get("component"), it.get("page"), it.get("source", {}).get("offset"))
        if key in seen:
            continue
        seen.add(key)
        base = "%s:%s" % (it["kind"], slug(it.get("name") or it.get("component") or it.get("primitive")))
        if it["kind"] == "settings-row":
            base = "settings-row:%s:%s" % (it["page"], slug(it["name"]))
        counts[base] += 1
        it["id"] = base if counts[base] == 1 else "%s~%d" % (base, counts[base])
        it.move_to_end("id", last=False)
        out.append(it)

    # every UI-facing string literal, so the map can tell UI copy from seed data
    ui_strings = set()
    for c in chunks:
        for m in re.finditer(r'(?:children|title|label|placeholder|description|"aria-label"|tooltip|text|heading|emptyText|confirmLabel|cancelLabel):' + STR, c.text):
            v = unescape(m.group(1)).strip()
            if 2 <= len(v) <= 240 and re.search(r"[A-Za-z]", v):
                ui_strings.add(v)
    doc = OrderedDict(
        schema="openconductor.ui-inventory/1",
        source=OrderedDict(
            app="Conductor 0.87.6", binary_sha256="0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d",
            chunks=[OrderedDict(name=c.name, sha256=c.sha256, bytes=len(c.text.encode())) for c in chunks],
            note="Untrusted third-party data: copy is recorded for matching only."),
        counts=OrderedDict(sorted(defaultdict(int, {k: sum(1 for i in out if i["kind"] == k) for k in {i["kind"] for i in out}}).items())),
        items=out,
        ui_strings=sorted(ui_strings))
    with open(a.out, "w") as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
    print(json.dumps(doc["counts"]))


if __name__ == "__main__":
    sys.exit(main())
