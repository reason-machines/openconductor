import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import sys

sys.path.insert(0, str(Path(__file__).parent))
SPEC = importlib.util.spec_from_file_location("build_map", Path(__file__).with_name("build_map.py"))
build_map = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_map)


class ScopeReportTest(unittest.TestCase):
    def test_generated_report_separates_scope_and_observation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / "parity/ui-map"
            here = root / "tools/ui-map"
            out.mkdir(parents=True)
            here.mkdir(parents=True)
            states = [
                {"id": "home", "title": "Home", "ref": {"path": "/"}},
                {"id": "route-team", "title": "Team", "ref": {"path": "/team"}},
                {"id": "route-routines", "title": "Routines", "ref": {"path": "/routines"}},
                {"id": "settings-appearance", "title": "Appearance", "ref": {"path": "/settings/user/appearance"}},
            ]
            (here / "states.json").write_text(json.dumps({"states": states, "viewport": {"width": 1280, "height": 820}, "theme": "dark"}))
            inventory = {"source": {"app": "Conductor fixture", "chunks": []}, "ui_strings": ["Open project"], "items": [
                {"id": "toast:invisible-error", "kind": "toast", "name": "Never observed error", "copy": []},
                {"id": "dialog:unlocated", "kind": "dialog", "name": "Unlocated dialog", "copy": ["Unlocated dialog"]},
                {"id": "popover:anonymous", "kind": "popover", "copy": []},
            ]}
            (out / "inventory.json").write_text(json.dumps(inventory))
            reference = {"home": {"status": "captured", "dom": {"texts": ["Open project"]}, "rea": {"evidence_id": "ref-home"}}}
            (out / "ref-captures.json").write_text(json.dumps(reference))
            (out / "oc-captures.json").write_text(json.dumps({"home": {"status": "captured", "dom": {"texts": ["Open project"]}}}))
            (out / "compare.json").write_text(json.dumps({"results": {"home": {"t24": {"changed_ratio": 0.01}}}}))
            old = build_map.ROOT, build_map.HERE, build_map.OUT
            build_map.ROOT, build_map.HERE, build_map.OUT = str(root), str(here), str(out)
            try:
                build_map.main()
            finally:
                build_map.ROOT, build_map.HERE, build_map.OUT = old
            report = json.loads((root / "parity/ui-map.json").read_text())
            self.assertEqual(report["summary"]["total"], 5)
            self.assertEqual(report["summary"]["matches"], 1)
            self.assertEqual(report["summary"]["missing"], 0)
            self.assertEqual(report["summary"]["unverified"], 4)
            self.assertEqual(report["raw_summary"]["total"], 7)
            self.assertEqual(report["excluded_summary"]["total"], 4)
            rows = {row["id"]: row for row in report["states"] + report["items"]}
            self.assertEqual(rows["route-team"]["scope"], "deferred")
            self.assertEqual(rows["route-routines"]["scope"], "deferred")
            self.assertEqual(rows["toast:invisible-error"]["scope"], "not-required")
            self.assertEqual(rows["dialog:unlocated"]["status"], "unverified")
            self.assertEqual(rows["dialog:unlocated"]["raw_status"], "missing")
            self.assertEqual(rows["home"]["status"], "matches")
            self.assertTrue(all(screen["final_review"] == "unverified" for screen in report["main_screens"].values()))
            self.assertEqual(report["requirements"][1]["id"], "deferred-ui-default-off")
            self.assertEqual(report["requirements"][1]["status"], "unverified")
            self.assertTrue((root / "parity/ui-program/ledger.html").is_file())
            self.assertIn("Unverified", (root / "parity/ui-map.md").read_text())

    def test_no_reference_does_not_prove_missing_or_wrong(self):
        from scoped_report import annotate
        for status in ("missing", "wrong"):
            row = dict(id="dialog:test", kind="dialog", team="shell", name="Test", status=status, why="Raw gap", observed_in_reference=False)
            annotate(row)
            self.assertEqual(row["status"], "unverified")
            self.assertEqual(row["raw_status"], status)

    def test_observed_gap_stays_a_gap_and_no_match_is_promoted(self):
        from scoped_report import annotate
        for status in ("missing", "wrong", "matches"):
            row = dict(id="dialog:test", kind="dialog", team="shell", name="Test", status=status, why="Raw evidence", observed_in_reference=True)
            annotate(row)
            self.assertEqual(row["status"], status)
            self.assertEqual(row["scope"], "in-scope")

    def test_cloud_only_routes_are_excluded_even_with_a_local_owner(self):
        from scoped_report import annotate
        for path in ("/cloud-collab-onboarding", "/new-member-onboarding", "/settings/user/ports", "/settings/organization/github"):
            row = dict(id="route:test", kind="route", team="settings", name=path, status="missing", why="Not reached", observed_in_reference=False)
            annotate(row)
            self.assertEqual(row["scope"], "deferred")


if __name__ == "__main__":
    unittest.main()
