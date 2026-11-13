"""Mutation checks for the notification boundary protected by the FDA verifier."""
from pathlib import Path
import unittest

from verify import verify_notification_block

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


class NotificationGuardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = (HERE / 'baseline/GeneralPage.tsx').read_text()
        cls.page = (ROOT / 'src/settings/GeneralPage.tsx').read_text()

    def reject_change(self, old, new):
        self.assertEqual(self.page.count(old), 1)
        mutated = self.page.replace(old, new, 1)
        with self.assertRaises(AssertionError):
            verify_notification_block(mutated, self.baseline)

    def test_accepts_exact_denial_feedback(self):
        verify_notification_block(self.page, self.baseline)

    def test_rejects_missing_feedback(self):
        self.reject_change('              notify?.("error", "Notification permission not granted");\n', '')

    def test_rejects_permission_without_await(self):
        self.reject_change('on && !await notificationPermissionGranted()', 'on && !notificationPermissionGranted()')

    def test_rejects_saving_after_denial(self):
        self.reject_change('              return;\n', '')

    def test_rejects_permission_check_on_disable(self):
        self.reject_change('on && !await notificationPermissionGranted()', '!await notificationPermissionGranted()')

    def test_rejects_stale_settings_write(self):
        self.reject_change('save(withField(latestSettings.current, "general", "send_native_notification", on))', 'save(withField(settings, "general", "send_native_notification", on))')


if __name__ == '__main__':
    unittest.main(verbosity=2)
