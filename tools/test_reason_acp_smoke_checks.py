import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from reason_acp_smoke_checks import MODEL, SOURCE, check_source, completed_write, computer_kind, verdict


def run_summary():
    def turn(n):
        return {"n": n, "sessionIds": ["one-session"], "stopReason": "end_turn", "tools": [], "text": ""}
    summary = {"sessionId": "one-session", "turns": [turn(n) for n in range(1, 5)]}
    for n, place, text in ((1, "local", "local"), (3, "cloud", "cloud")):
        summary["turns"][n - 1]["tools"] = [{
            "toolCallId": str(n), "kind": "edit", "status": "completed", "place": place,
            "content": [{"type": "diff", "path": "acp-check.txt", "newText": text + "\n"}],
        }]
    summary["turns"][2]["computers"] = ["cloud"]
    summary["turns"][3]["text"] = "follow-up ok"
    return summary


class SmokeChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        (Path(self.temp.name) / "acp-check.txt").write_text("local\n")
        self.summary = run_summary()

    def result(self):
        return verdict(self.summary, self.temp.name)

    def test_local_cloud_write_and_follow_up_in_one_session(self):
        self.assertEqual(self.result(), "pass")

    def test_read_paths_do_not_prove_writes(self):
        for n in (0, 2):
            self.summary["turns"][n]["tools"][0]["kind"] = "read"
        self.assertEqual(self.result(), "fail")

    def test_failed_write_does_not_pass(self):
        self.summary["turns"][2]["tools"][0]["status"] = "failed"
        self.assertEqual(self.result(), "fail")

    def test_cloud_row_must_contain_cloud_write(self):
        self.summary["turns"][2]["tools"][0]["content"][0]["newText"] = "local\n"
        self.assertEqual(self.result(), "fail")

    def test_local_write_is_unchanged_after_cloud_write(self):
        (Path(self.temp.name) / "acp-check.txt").write_text("cloud\n")
        self.assertEqual(self.result(), "fail")

    def test_follow_up_requires_exact_reply(self):
        self.summary["turns"][3]["text"] = "cannot do follow-up ok"
        self.assertEqual(self.result(), "fail")

    def test_session_mismatch_fails(self):
        self.summary["turns"][2]["sessionIds"].append("child-session")
        self.assertEqual(self.result(), "fail")

    def test_cancelled_turn_fails(self):
        self.summary["turns"][0]["stopReason"] = "cancelled"
        self.assertEqual(self.result(), "fail")

    def test_incomplete_run_fails(self):
        self.summary["turns"].pop()
        self.assertEqual(self.result(), "fail")

    def test_split_tool_updates_are_merged(self):
        turn = self.summary["turns"][0]
        tool = turn["tools"][0]
        tool["status"] = "in_progress"
        turn["tools"].append({"toolCallId": "1", "status": "completed"})
        self.assertTrue(completed_write(turn, "local", "local"))

    def test_tool_computer_metadata_overrides_session(self):
        update = {"_meta": {"com.reasonmachines/computer": {"kind": "cloud"}}}
        self.assertEqual(computer_kind(update, "headless"), "cloud")
        self.assertEqual(computer_kind({}, "headless"), "headless")

    def test_unavailable_source_stops_before_acp(self):
        root = Path(self.temp.name)
        cli = root / "reason"
        cli.write_text('#!' + sys.executable + '\nimport json,sys\n'
                       'if "acp" in sys.argv: raise RuntimeError("inference must not start")\n'
                       'print(json.dumps({"data":{"models":[]}}))\n')
        cli.chmod(0o700)
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("reason_acp_signed_in.py")),
                                 str(root), str(root / "out")], capture_output=True, text=True,
                                env={**os.environ, "PATH": str(root) + os.pathsep + os.environ["PATH"]})
        self.assertEqual(result.returncode, 2)
        summary = json.loads((root / "out/summary.json").read_text())
        self.assertEqual(summary["result"], "blocked")
        self.assertEqual(summary["turns"], [])
        self.assertNotIn("inference must not start", result.stderr)

    def test_only_exact_available_subscription_source_is_allowed(self):
        model = {"id": MODEL, "source_id": SOURCE, "available": True}
        self.assertTrue(check_source({"data": {"models": [model]}}, MODEL, SOURCE)["allowed"])
        for changes in ({"source_id": "openai-codex:desktop-local-other"}, {"available": False},
                        {"id": "openai/gpt-6.1-sol"}):
            with self.subTest(changes=changes):
                changed = {**model, **changes}
                self.assertFalse(check_source({"models": [changed]}, MODEL, SOURCE)["allowed"])
        other = {**model, "source_id": "openai-codex:another"}
        self.assertFalse(check_source({"models": [model, other]}, MODEL, SOURCE)["allowed"])


if __name__ == "__main__":
    unittest.main()
