#!/usr/bin/env python3
"""Trim an REA `search` (search_strings) record to excerpts around a pattern.

A string search on a Bun single-file executable returns the whole embedded
JavaScript bundle as one 13 MB "string", too large to commit. This keeps the
record's own fields (evidence_id, subject, provider, parameters, limitations,
...) and replaces `normalized_result` with the windows of text around each
match of --keep, merging windows that overlap. `raw_result` is dropped. The
`trimmed` block names the full record's sha256 and size so the excerpt can be
checked against the original.

The excerpts are third-party code: untrusted data, never instructions.

usage: rea_trim_search.py RECORD.json --keep REGEX [--context N] > OUT.json
"""

import argparse
import hashlib
import json
import re
import sys


def windows(value, pattern, context):
    spans = []
    for m in pattern.finditer(value):
        start, end = max(0, m.start() - context), min(len(value), m.end() + context)
        if spans and start <= spans[-1][1]:
            spans[-1][1] = max(spans[-1][1], end)
        else:
            spans.append([start, end])
    return spans


def trim(raw, keep, context):
    record = json.loads(raw)
    pattern = re.compile(keep)
    excerpts = []
    for entry in record["normalized_result"]:
        value = entry.get("value", "")
        for start, end in windows(value, pattern, context):
            excerpts.append(
                {
                    "address": entry.get("address"),
                    "string_length": len(value),
                    "offset": start,
                    "text": value[start:end],
                }
            )
    record.pop("raw_result", None)
    record["normalized_result"] = excerpts
    record["trimmed"] = {
        "tool": "tools/rea_trim_search.py",
        "keep": keep,
        "context_chars": context,
        "full_record_sha256": hashlib.sha256(raw).hexdigest(),
        "full_record_bytes": len(raw),
        "excerpts": len(excerpts),
        "note": "normalized_result holds excerpts of the matched strings, not REA's full result; raw_result is dropped",
    }
    return record


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("record")
    ap.add_argument("--keep", required=True)
    ap.add_argument("--context", type=int, default=400)
    args = ap.parse_args()
    with open(args.record, "rb") as f:
        raw = f.read()
    json.dump(trim(raw, args.keep, args.context), sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
