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

    def row(self, label):
        start = self.page.index(f'      <Row label="{label}"')
        stop = self.page.index('      </Row>\n', start) + len('      </Row>\n')
        return self.page[start:stop]

    def reject_change(self, old, new, labels=('Agent notifications', '@ notifications')):
        for label in labels:
            with self.subTest(row=label):
                row = self.row(label)
                self.assertEqual(row.count(old), 1)
                mutated = self.page.replace(row, row.replace(old, new, 1), 1)
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
        self.reject_change('save(withField(latestSettings.current, "general", "send_native_notification", on))', 'save(withField(settings, "general", "send_native_notification", on))', ('Agent notifications',))
        self.reject_change('save(withBoolPref(latestSettings.current, "mention_notifications_enabled", on))', 'save(withBoolPref(settings, "mention_notifications_enabled", on))', ('@ notifications',))

    def test_rejects_ungated_mention_row(self):
        original = next(line + '\n' for line in self.baseline.splitlines() if 'pref="mention_notifications_enabled"' in line)
        mutated = self.page.replace(self.row('@ notifications'), original, 1)
        with self.assertRaises(AssertionError):
            verify_notification_block(mutated, self.baseline)

    def test_rejects_wrong_mention_preference(self):
        self.reject_change('checked={boolPref(settings, "mention_notifications_enabled")}', 'checked={boolPref(settings, "auto_convert_long_text")}', ('@ notifications',))
        self.reject_change('save(withBoolPref(latestSettings.current, "mention_notifications_enabled", on))', 'save(withBoolPref(latestSettings.current, "auto_convert_long_text", on))', ('@ notifications',))

    def test_rejects_extra_row_content(self):
        self.reject_change('        />\n', '        />\n        <span>Unexpected notification content</span>\n')


if __name__ == '__main__':
    unittest.main(verbosity=2)
