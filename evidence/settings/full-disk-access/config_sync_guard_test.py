"""Mutation checks for the exact Sync notification-capture integration."""
from pathlib import Path
import json
import unittest

from verify import verify_config_sync_harness

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


class ConfigSyncHarnessGuardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.harness = (ROOT / 'src/settings/configSyncHarness.cjs').read_bytes()
        cls.expected = json.loads((HERE / 'provenance.json').read_text())['frozen_files']['src/settings/configSyncHarness.cjs']

    def reject_change(self, old, new):
        self.assertEqual(self.harness.count(old), 1)
        with self.assertRaises(AssertionError):
            verify_config_sync_harness(self.harness.replace(old, new, 1), self.expected)

    def test_accepts_exact_capture_extension(self):
        verify_config_sync_harness(self.harness, self.expected)

    def test_rejects_missing_collector(self):
        self.reject_change(b'boundaries: [], notifications: []', b'boundaries: []')

    def test_rejects_missing_callback(self):
        self.reject_change(b'    notify: (kind, message) => calls.notifications.push({ kind, message }),\n', b'')

    def test_rejects_changed_capture(self):
        self.reject_change(b'calls.notifications.push({ kind, message })', b'calls.notifications.push({ kind })')

    def test_rejects_duplicate_callback(self):
        callback = b'    notify: (kind, message) => calls.notifications.push({ kind, message }),\n'
        self.reject_change(callback, callback + callback)

    def test_rejects_unrelated_boundary_change(self):
        self.reject_change(b'save: blocked("save")', b'save: () => undefined')


if __name__ == '__main__':
    unittest.main(verbosity=2)
