"""Diff two REA `inspect-sqlite-database --schema-scope database --format json`
Evidence files: tables (columns and flags), indexes and triggers.

Usage: python3 tools/sqlite_schema_diff.py REFERENCE.json REBUILD.json
Exits 1 when any schema object is missing, extra or different.
"""

import json
import sys


def load(path):
    with open(path) as f:
        return json.load(f)["normalized_result"]["schema"]


def normalise(schema):
    out = {}
    for table in schema["tables"]:
        name = "table " + table["name"]
        cols = [{k: v for k, v in c.items() if k != "cid"} for c in table.get("columns", [])]
        out[name] = json.dumps(cols, sort_keys=True)
        for flag in ("without_rowid", "strict", "column_count"):
            out[f"{name} {flag}"] = table.get(flag)
    for kind, objects in schema.items():
        if kind == "tables" or not isinstance(objects, list):
            continue
        for obj in objects:
            fields = {k: v for k, v in obj.items() if k not in ("sql", "root_page")}
            # Formatting differs; IF NOT EXISTS "x" vs x is the reference's rebuild quirk.
            sql = " ".join((obj.get("sql") or "").split())
            fields["sql"] = sql.replace('IF NOT EXISTS "sessions"', "sessions")
            out[f"{kind} {obj['name']}"] = json.dumps(fields, sort_keys=True)
    return out


def main(reference, rebuild):
    a, b = normalise(load(reference)), normalise(load(rebuild))
    missing = sorted(set(a) - set(b))
    extra = sorted(set(b) - set(a))
    differ = sorted(k for k in a.keys() & b.keys() if a[k] != b[k])
    print(f"objects: reference {len(a)}, rebuild {len(b)}")
    for label, keys in (("missing", missing), ("extra", extra), ("differ", differ)):
        print(f"{label}: {len(keys)}")
        for key in keys:
            print(f"  {key}")
    return 1 if missing or extra or differ else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
