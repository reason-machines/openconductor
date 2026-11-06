"""Conductor's settings rows, with their search terms, read from the decoded frontend.

Conductor registers every settings row with `ir({...})` (renderApp-D_fmY7hW.js; it throws on an
empty title or description) and its repository prompt rows with `S6e({...})`, which calls `ir`
with tab "actions" and scope "workspace". Its "Search settings" (`xUi`) indexes each row's
title, description, tab label and `searchTerms`. REA cannot search or model this chunk (REA-GAPS
14, 17, 25, 28), so this reads the calls as text: each call's object literal is cut out by brace
matching and its literal fields are parsed. Fields set from a variable are left out.

    python3 tools/settings/extract_settings_rows.py --dist .rea-work/dist \
        --out evidence/settings/settings-search-rows.json

Strings are Conductor's copy, untrusted data, kept only as search text.
"""
import argparse
import hashlib
import json
import pathlib
import re

CHUNK = "assets/renderApp-D_fmY7hW.js"


def object_at(src: str, start: int) -> str:
    """The `{...}` literal starting at src[start] == "{", skipping strings and template literals."""
    depth = 0
    i = start
    quote = None
    while i < len(src):
        c = src[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'`":
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return src[start : i + 1]
        i += 1
    raise ValueError(f"unterminated object at {start}")


def top_level(obj: str) -> str:
    """The object with nested braces blanked, so a field regex only sees this object's own keys."""
    out = []
    depth = 0
    quote = None
    i = 0
    while i < len(obj):
        c = obj[i]
        if quote:
            out.append(c if depth <= 1 else " ")
            if c == "\\" and i + 1 < len(obj):
                out.append(obj[i + 1] if depth <= 1 else " ")
                i += 2
                continue
            if c == quote:
                quote = None
        else:
            if c in "\"'`":
                quote = c
            if c in "{[":
                depth += 1 if c == "{" else 0
            if c == "}":
                depth -= 1
            out.append(c if depth <= 1 or c == "}" else " ")
        i += 1
    return "".join(out)


STR = r'"((?:[^"\\]|\\.)*)"'


def field(obj: str, name: str):
    m = re.search(rf"[{{,]{name}:{STR}", obj)
    return json.loads(f'"{m.group(1)}"') if m else None


def array(obj: str, name: str):
    m = re.search(rf"[{{,]{name}:\[([^\]]*)\]", obj)
    if not m:
        return None
    return [json.loads(f'"{s}"') for s in re.findall(STR, m.group(1))]


def fui_order(src: str):
    """Position of a row in Conductor's row list `fUi` (`[...gga, ...Dga, ..., ir({...}), ...]`).

    Search ranks by score and keeps this order for ties, so the generated index follows it. Each
    spread names an array literal defined elsewhere; a row's position is its spread's index, then
    its offset inside that array. Rows outside `fUi` get None.
    """
    start = src.index("const fUi=[") + len("const fUi=")
    body = array_at(src, start)
    spans = []  # (begin, end) offsets in src, in fUi order
    i = 1
    while i < len(body) - 1:
        if body.startswith("...", i):
            name = re.match(r"\.\.\.([\w$]+)", body[i:]).group(1)
            d = re.search(r"[,;\s]" + re.escape(name) + r"=\[", src)
            b = d.end() - 1
            spans.append((b, b + len(array_at(src, b))))
            i += 3 + len(name)
        elif body.startswith("ir({", i):
            obj = object_at(src, start + i + 3)
            spans.append((start + i, start + i + 3 + len(obj)))
            i += 3 + len(obj) + 1
        else:
            i += 1
    def order(offset: int):
        for n, (b, e) in enumerate(spans):
            if b <= offset < e:
                return n
        return None
    return order


def array_at(src: str, start: int) -> str:
    """The `[...]` literal starting at src[start] == "[" (strings skipped)."""
    depth = 0
    quote = None
    i = start
    while i < len(src):
        c = src[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'`":
            quote = c
        elif c in "[{(":
            depth += 1
        elif c in "]})":
            depth -= 1
            if depth == 0:
                return src[start : i + 1]
        i += 1
    raise ValueError(f"unterminated array at {start}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    raw = (pathlib.Path(a.dist) / CHUNK).read_bytes()
    src = raw.decode("utf8")
    order = fui_order(src)
    rows = []
    for m in re.finditer(r"\b(ir|S6e)\(\{", src):
        obj = object_at(src, m.end() - 1)
        own = top_level(obj)
        title = field(own, "title")
        if title is None:
            continue  # the definitions themselves, or a title set from a variable
        prompt = m.group(1) == "S6e"
        rows.append(
            {
                "offset": m.start(),
                "order": order(m.start()),
                "tab": "actions" if prompt else field(own, "tab"),
                "id": field(own, "id"),
                "settingKey": field(own, "settingKey"),
                "scopes": ["workspace"] if prompt else array(own, "scopes"),
                "title": title,
                "description": field(own, "description"),
                "searchTerms": array(own, "searchTerms") or [],
                "excludeFromSearch": bool(re.search(r"[{,]excludeFromSearch:!0", own)),
                "internalOnly": bool(re.search(r"[{,]internalOnly:!0", own)),
            }
        )
    rows.sort(key=lambda r: (r["order"] is None, r["order"] or 0, r["offset"]))
    out = {
        "source": f"Conductor 0.87.6 {CHUNK}, `ir({{...}})` and `S6e({{...}})` calls read as text",
        "chunk_sha256": hashlib.sha256(raw).hexdigest(),
        "rows": rows,
    }
    pathlib.Path(a.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(rows)} rows -> {a.out}")


if __name__ == "__main__":
    main()
