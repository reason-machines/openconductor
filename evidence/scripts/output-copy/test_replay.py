"""Check result classification without executing Node or the application."""

import unittest

from replay import CASES, validate_tap


def tap(baseline):
    lines = ["TAP version 13"]
    for index, name in enumerate(CASES):
        failed = baseline and index < 4
        lines.append(f"{'not ok' if failed else 'ok'} {index + 1} - {name}")
        if failed:
            lines.extend([
                "  ---", "  code: 'ERR_ASSERTION'", "  operator: 'deepStrictEqual'",
                "  text: alpha", "  prevented: true", "  ...",
            ])
    lines.extend(["# tests 9", f"# fail {4 if baseline else 0}"])
    return "\n".join(lines)


class ReplayClassificationTests(unittest.TestCase):
    def test_four_payload_failures_and_five_controls(self):
        self.assertEqual(validate_tap(tap(True), 1, True), {"passed": 5, "failed": 4})

    def test_nine_after_fix_passes(self):
        self.assertEqual(validate_tap(tap(False), 0, False), {"passed": 9, "failed": 0})

    def test_after_fix_passes_are_not_baseline_red(self):
        with self.assertRaises(AssertionError):
            validate_tap(tap(False), 0, True)

    def test_rejects_setup_errors_and_incomplete_or_different_failures(self):
        original = tap(True)
        for output in (
            original.replace("ERR_ASSERTION", "ERR_MODULE_NOT_FOUND"),
            original.replace("deepStrictEqual", "strictEqual"),
            original.replace("prevented:", "other:"),
            original.replace("not ok 1 -", "ok 1 -"),
            original.replace("# tests 9", "# tests 1"),
            original.replace("# fail 4", "# fail 5"),
            original.replace(CASES[0], "fixture setup failed"),
            original + "\nok 10 - unexpected test",
        ):
            with self.subTest(output=output), self.assertRaises(AssertionError):
                validate_tap(output, 1, True)

    def test_rejects_wrong_exit_codes(self):
        for baseline, returncode in ((True, 0), (True, 2), (False, 1)):
            with self.subTest(baseline=baseline, returncode=returncode), self.assertRaises(AssertionError):
                validate_tap(tap(baseline), returncode, baseline)


if __name__ == "__main__":
    unittest.main()
