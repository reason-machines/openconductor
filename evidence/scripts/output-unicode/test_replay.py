"""Validate width-result classification without executing JavaScript."""

import unittest

from replay import CASES, DIFFERENCES, validate_tap


def tap(baseline):
    lines = ["TAP version 13"]
    for index, name in enumerate(CASES):
        failed = baseline and index < 4
        lines.append(f"{'not ok' if failed else 'ok'} {index + 1} - {name}")
        if failed:
            actual, expected = DIFFERENCES[index]
            lines.extend([
                "  ---", "  code: 'ERR_ASSERTION'", "  operator: 'strictEqual'",
                f"  actual: {actual}", f"  expected: {expected}", "  ...",
            ])
    lines.extend(["# tests 9", f"# fail {4 if baseline else 0}"])
    return "\n".join(lines)


class WidthReplayTests(unittest.TestCase):
    def test_four_width_failures_and_five_controls(self):
        self.assertEqual(validate_tap(tap(True), 1, True), {"passed": 5, "failed": 4})

    def test_nine_candidate_passes(self):
        self.assertEqual(validate_tap(tap(False), 0, False), {"passed": 9, "failed": 0})

    def test_green_is_not_baseline_proof(self):
        with self.assertRaises(AssertionError):
            validate_tap(tap(False), 0, True)

    def test_rejects_setup_errors_wrong_widths_and_incomplete_results(self):
        original = tap(True)
        for output in (
            original.replace("ERR_ASSERTION", "ERR_MODULE_NOT_FOUND"),
            original.replace("strictEqual", "deepStrictEqual"),
            original.replace("actual: 3", "actual: 0", 1),
            original.replace("expected: 'Z'", "expected: 'different'"),
            original.replace(CASES[0], "fixture setup failed"),
            original.replace("not ok 1 -", "ok 1 -"),
            original.replace("# tests 9", "# tests 1"),
            original.replace("# fail 4", "# fail 5"),
            original + "\nok 10 - extra test",
        ):
            with self.subTest(output=output), self.assertRaises(AssertionError):
                validate_tap(output, 1, True)

    def test_rejects_wrong_exit_codes(self):
        for baseline, returncode in ((True, 0), (True, 2), (False, 1)):
            with self.subTest(baseline=baseline, returncode=returncode), self.assertRaises(AssertionError):
                validate_tap(tap(baseline), returncode, baseline)


if __name__ == "__main__":
    unittest.main()
