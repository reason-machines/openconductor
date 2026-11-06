#!/usr/bin/env python3
"""Read-only inventory of e2e-named workspaces in OpenConductor's real data."""
import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def audit(root):
    root = root.expanduser().resolve()
    with sqlite3.connect((root / "conductor.db").as_uri() + "?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        workspaces = [dict(r) for r in db.execute(
            "SELECT local_id,repository_id,directory_name,workspace_name,workspace_path,state FROM workspaces")]
        repos = [dict(r) for r in db.execute("SELECT id,name,root_path FROM repos")]
    candidates = [r for r in workspaces if any("-e2e-" in str(v) for v in r.values() if v)]
    repo_candidates = [r for r in repos if any("-e2e-" in str(v) for v in r.values() if v)]
    directories = sorted(str(p.relative_to(root)) for name in ("workspaces", "archived", "repos")
                         for p in (root / name).rglob("*") if p.is_dir() and "-e2e-" in p.name)
    playground = next((r for r in repos if r["id"] == "openconductor-playground"), None)
    bergen = next((r for r in workspaces if r["local_id"] == "openconductor-playground/bergen"), None)
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "scope": "primary OpenConductor data directory; DB opened mode=ro; no chat or file contents read",
        "workspace_rows": len(workspaces), "repository_rows": len(repos),
        "test_workspace_rows_remaining": len(candidates), "test_repository_rows_remaining": len(repo_candidates),
        "test_named_directories_remaining": len(directories),
        "test_candidates": {"workspace_ids": [r["local_id"] for r in candidates],
                            "repository_ids": [r["id"] for r in repo_candidates], "directories": directories},
        "removed": {"workspace_rows": 0, "repository_rows": 0, "directories": 0},
        "preserved": {
            "openconductor-playground": {"row_present": playground is not None,
                "root_exists": bool(playground and Path(playground["root_path"]).is_dir())},
            "bergen": {"row_present": bergen is not None, "state": bergen["state"] if bergen else None,
                "workspace_path_exists": bool(bergen and Path(bergen["workspace_path"]).is_dir()),
                "archived_path_exists": (root / "archived/openconductor-playground/bergen").is_dir()},
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_dir", type=Path)
    print(json.dumps(audit(parser.parse_args().data_dir), indent=2))
