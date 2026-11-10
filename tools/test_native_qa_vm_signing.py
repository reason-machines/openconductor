from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from . import native_qa_vm_signing as signing


class VMRunnerSigningTests(unittest.TestCase):
    def test_exact_boolean_entitlements(self):
        signing.verify_entitlements(plistlib.dumps(signing.ENTITLEMENTS))

    def test_extra_missing_false_and_nonboolean_entitlements_refused(self):
        cases = [
            {**signing.ENTITLEMENTS, "com.apple.security.network.client": True},
            {**signing.ENTITLEMENTS, "com.apple.security.cs.disable-library-validation": True},
            {**signing.ENTITLEMENTS, "com.apple.security.app-sandbox": False},
            {**signing.ENTITLEMENTS, "com.apple.security.virtualization": 1},
            {"com.apple.security.virtualization": True},
            {},
        ]
        for values in cases:
            with self.subTest(values=values), self.assertRaises(ValueError):
                signing.verify_entitlements(plistlib.dumps(values))

    def test_tracked_entitlements_match_contract(self):
        signing.verify_entitlements(
            Path("native-qa-vm-runner/Entitlements.plist").read_bytes())

    def bundle(self, directory):
        bundle = Path(directory) / "Runner.app"
        (bundle / "Contents/MacOS").mkdir(parents=True)
        (bundle / "Contents/MacOS" / signing.EXECUTABLE).write_bytes(b"synthetic-not-executable")
        (bundle / "Contents/Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": signing.BUNDLE_ID,
            "CFBundleExecutable": signing.EXECUTABLE,
        }))
        return bundle

    def test_reads_signed_entitlements_not_only_source_plist(self):
        with tempfile.TemporaryDirectory() as root:
            bundle = self.bundle(root)
            signed = {**signing.ENTITLEMENTS, "com.apple.security.network.server": True}
            with patch.object(signing.subprocess, "run", return_value=
                              subprocess.CompletedProcess([], 0, plistlib.dumps(signed))) as run:
                with self.assertRaises(ValueError):
                    signing.verify_bundle(bundle)
                self.assertEqual(run.call_count, 2)
                self.assertIn("--verify", run.call_args_list[0].args[0])
                self.assertIn("--entitlements", run.call_args_list[1].args[0])

    def test_valid_signed_bundle_does_not_execute_runner(self):
        with tempfile.TemporaryDirectory() as root:
            bundle = self.bundle(root)
            with patch.object(signing.subprocess, "run", return_value=
                              subprocess.CompletedProcess([], 0, plistlib.dumps(signing.ENTITLEMENTS))) as run:
                signing.verify_bundle(bundle)
                self.assertEqual(run.call_count, 2)
                for call in run.call_args_list:
                    self.assertEqual(call.args[0][0], "/usr/bin/codesign")

    def test_signature_failure_has_no_fallback(self):
        with tempfile.TemporaryDirectory() as root:
            bundle = self.bundle(root)
            with patch.object(signing.subprocess, "run", side_effect=
                              subprocess.CalledProcessError(1, "codesign")) as run:
                with self.assertRaises(subprocess.CalledProcessError):
                    signing.verify_bundle(bundle)
                self.assertEqual(run.call_count, 1)

    def test_extra_helper_and_symlink_refused_before_codesign(self):
        for symlink in (False, True):
            with self.subTest(symlink=symlink), tempfile.TemporaryDirectory() as root:
                bundle = self.bundle(root)
                extra = bundle / "Contents/MacOS/extra"
                if symlink:
                    extra.symlink_to(signing.EXECUTABLE)
                else:
                    extra.write_bytes(b"extra")
                with patch.object(signing.subprocess, "run") as run:
                    with self.assertRaises(ValueError):
                        signing.verify_bundle(bundle)
                    run.assert_not_called()

    def test_wrong_identity_refused_before_codesign(self):
        with tempfile.TemporaryDirectory() as root:
            bundle = self.bundle(root)
            (bundle / "Contents/Info.plist").write_bytes(plistlib.dumps({
                "CFBundleIdentifier": "com.reasonmachines.openconductor",
                "CFBundleExecutable": signing.EXECUTABLE,
            }))
            with patch.object(signing.subprocess, "run") as run:
                with self.assertRaises(ValueError):
                    signing.verify_bundle(bundle)
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
