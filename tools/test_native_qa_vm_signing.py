from contextlib import contextmanager, redirect_stderr, redirect_stdout
import hashlib
import io
import json
import os
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
        bundle = Path(directory).resolve() / "Runner.app"
        (bundle / "Contents/MacOS").mkdir(parents=True)
        (bundle / "Contents/MacOS" / signing.EXECUTABLE).write_bytes(b"synthetic-not-executable")
        (bundle / "Contents/Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": signing.BUNDLE_ID,
            "CFBundleExecutable": signing.EXECUTABLE,
        }))
        return bundle

    def receipt(self, directory):
        receipt = Path(directory).resolve() / "independent-build.json"
        receipt.write_text(json.dumps({
            "schema": 1,
            "repository": "reason-machines/openconductor",
            "source_commit": "a" * 40,
            "build_id": "retained-ci-job-123",
            "executable_sha256": hashlib.sha256(b"synthetic-not-executable").hexdigest(),
        }))
        return receipt

    def test_substituted_executable_with_same_signed_metadata_refused(self):
        with tempfile.TemporaryDirectory() as root:
            bundle = self.bundle(root)
            receipt = self.receipt(root)
            (bundle / "Contents/MacOS" / signing.EXECUTABLE).write_bytes(b"substituted")
            with patch.object(signing.subprocess, "run", return_value=
                              subprocess.CompletedProcess([], 0, plistlib.dumps(signing.ENTITLEMENTS))):
                with self.assertRaises(ValueError):
                    signing.verify_build_identity(
                        bundle, build_receipt=receipt, expected_source="a" * 40)

    @contextmanager
    def identity_fixture(self):
        with tempfile.TemporaryDirectory() as root:
            yield self.bundle(root), self.receipt(root), Path(root).resolve()

    def signed_metadata(self):
        return subprocess.CompletedProcess([], 0, plistlib.dumps(signing.ENTITLEMENTS))

    def test_matching_independent_receipt_and_source_accept_without_execution(self):
        with self.identity_fixture() as (bundle, receipt, _):
            with patch.object(signing.subprocess, "run", return_value=self.signed_metadata()) as run:
                result = signing.verify_build_identity(
                    bundle, build_receipt=receipt, expected_source="a" * 40)
                self.assertEqual(result.source_commit, "a" * 40)
                self.assertEqual(result.build_id, "retained-ci-job-123")
                self.assertEqual(result.executable_sha256,
                                 hashlib.sha256(b"synthetic-not-executable").hexdigest())
                self.assertEqual(run.call_count, 2)
                for call in run.call_args_list:
                    self.assertEqual(call.args[0][0], "/usr/bin/codesign")

    def test_missing_or_malformed_expected_identity_refused_before_codesign(self):
        with self.identity_fixture() as (bundle, receipt, root):
            cases = [
                {}, {"build_receipt": receipt}, {"expected_source": "a" * 40},
                {"build_receipt": root / "missing.json", "expected_source": "a" * 40},
            ]
            cases.extend({"build_receipt": receipt, "expected_source": source}
                         for source in (None, "", "main", "a" * 39, "A" * 40,
                                        "a" * 40 + "\n", True, 1))
            for arguments in cases:
                with self.subTest(arguments=arguments), patch.object(signing.subprocess, "run") as run:
                    with self.assertRaises((ValueError, OSError)):
                        signing.verify_build_identity(bundle, **arguments)
                    run.assert_not_called()

    def test_malformed_or_wrong_source_receipt_refused_before_codesign(self):
        with self.identity_fixture() as (bundle, receipt, _):
            valid = json.loads(receipt.read_bytes())
            cases = [[], None, {}, "not-an-object"]
            cases.extend({key: value for key, value in valid.items() if key != removed}
                         for removed in valid)
            for key, values in {
                "schema": [True, "1", 2],
                "repository": ["other/repo", None],
                "source_commit": ["b" * 40, "main", None],
                "build_id": ["", "   ", None, 1],
                "executable_sha256": ["", "a" * 63, "A" * 64, "a" * 64 + "\n", None, 1],
            }.items():
                cases.extend({**valid, key: value} for value in values)
            cases.append({**valid, "unexpected": "field"})
            documents = [json.dumps(value) for value in cases]
            documents += ["{", json.dumps(valid)[:-1] + ', "schema": 1}']
            for document in documents:
                with self.subTest(document=document), patch.object(signing.subprocess, "run") as run:
                    receipt.write_text(document)
                    with self.assertRaises(ValueError):
                        signing.verify_build_identity(
                            bundle, build_receipt=receipt, expected_source="a" * 40)
                    run.assert_not_called()

    def test_receipt_inside_candidate_is_not_an_independent_expectation(self):
        with self.identity_fixture() as (bundle, receipt, _):
            embedded = bundle / "build-receipt.json"
            embedded.write_bytes(receipt.read_bytes())
            with patch.object(signing.subprocess, "run") as run, self.assertRaises(ValueError):
                signing.verify_build_identity(
                    bundle, build_receipt=embedded, expected_source="a" * 40)
            run.assert_not_called()

    def test_identity_input_symlinks_and_hardlinks_refused(self):
        for target in ("receipt", "executable", "bundle", "parent", "hardlink"):
            with self.subTest(target=target), self.identity_fixture() as (bundle, receipt, root):
                executable = bundle / "Contents/MacOS" / signing.EXECUTABLE
                if target in ("receipt", "executable"):
                    path = receipt if target == "receipt" else executable
                    original = root / "original"
                    path.rename(original)
                    path.symlink_to(original)
                elif target == "bundle":
                    alias = root / "Alias.app"
                    alias.symlink_to(bundle, target_is_directory=True)
                    bundle = alias
                elif target == "parent":
                    alias = root / "alias"
                    alias.symlink_to(bundle.parent, target_is_directory=True)
                    bundle = alias / bundle.name
                else:
                    os.link(executable, root / "executable-link")
                with patch.object(signing.subprocess, "run") as run, self.assertRaises(ValueError):
                    signing.verify_build_identity(
                        bundle, build_receipt=receipt, expected_source="a" * 40)
                run.assert_not_called()

    def test_observed_candidate_or_receipt_mutation_during_signature_readback_refused(self):
        for target in ("executable", "replace-same-bytes", "restore-same-bytes",
                       "plist", "receipt", "helper", "symlink"):
            with self.subTest(target=target), self.identity_fixture() as (bundle, receipt, root):
                executable = bundle / "Contents/MacOS" / signing.EXECUTABLE
                os.utime(executable, ns=(0, 0))

                def mutate(*args, **kwargs):
                    if target == "executable":
                        executable.write_bytes(b"changed-during-codesign")
                    elif target == "replace-same-bytes":
                        replacement = root / "replacement"
                        replacement.write_bytes(b"synthetic-not-executable")
                        replacement.replace(executable)
                    elif target == "restore-same-bytes":
                        executable.write_bytes(b"changed")
                        executable.write_bytes(b"synthetic-not-executable")
                    elif target == "plist":
                        (bundle / "Contents/Info.plist").write_bytes(plistlib.dumps({
                            "CFBundleIdentifier": signing.BUNDLE_ID,
                            "CFBundleExecutable": signing.EXECUTABLE,
                            "CFBundleVersion": "substituted",
                        }))
                    elif target == "receipt":
                        values = json.loads(receipt.read_bytes())
                        receipt.write_text(json.dumps({**values, "build_id": "different-ci-job"}))
                    elif target == "helper":
                        (bundle / "Contents/MacOS/helper").write_bytes(b"unexpected")
                    else:
                        original = root / "original"
                        if not executable.is_symlink():
                            executable.rename(original)
                            executable.symlink_to(original)
                    return self.signed_metadata()

                with patch.object(signing.subprocess, "run", side_effect=mutate), self.assertRaises(ValueError):
                    signing.verify_build_identity(
                        bundle, build_receipt=receipt, expected_source="a" * 40)

    def test_matching_identity_does_not_bypass_signature_or_entitlement_failure(self):
        failures = [subprocess.CalledProcessError(1, "codesign"),
                    subprocess.CompletedProcess([], 0, plistlib.dumps({}))]
        for failure in failures:
            with self.subTest(failure=failure), self.identity_fixture() as (bundle, receipt, _):
                arguments = {"side_effect": failure} if isinstance(failure, Exception) else {"return_value": failure}
                with patch.object(signing.subprocess, "run", **arguments) as run:
                    with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                        signing.verify_build_identity(
                            bundle, build_receipt=receipt, expected_source="a" * 40)
                    self.assertEqual(run.call_count, 1 if isinstance(failure, Exception) else 2)

    def test_cli_metadata_only_is_explicit_and_identity_mode_has_no_fallback(self):
        with self.identity_fixture() as (bundle, receipt, _):
            for arguments, expected in [
                ([str(bundle)], "executable identity UNVERIFIED"),
                ([str(bundle), "--build-receipt", str(receipt), "--expected-source", "a" * 40],
                 "matches caller-trusted exact-source build receipt"),
            ]:
                with self.subTest(arguments=arguments), patch("sys.argv", ["checker", *arguments]), \
                        patch.object(signing.subprocess, "run", return_value=self.signed_metadata()), \
                        redirect_stdout(io.StringIO()) as output:
                    signing.main()
                    self.assertIn(expected, output.getvalue())
                    self.assertIn("not native admission", output.getvalue())
            for arguments in [
                ["--build-receipt", str(receipt)],
                ["--expected-source", "a" * 40],
                ["--build-receipt", str(receipt), "--expected-source", "b" * 40],
            ]:
                with self.subTest(arguments=arguments), patch("sys.argv", ["checker", str(bundle), *arguments]), \
                        patch.object(signing.subprocess, "run") as run, \
                        redirect_stdout(io.StringIO()) as output, redirect_stderr(io.StringIO()) as error:
                    with self.assertRaises(SystemExit) as refused:
                        signing.main()
                    self.assertEqual(refused.exception.code, 1)
                    self.assertEqual(output.getvalue(), "")
                    self.assertIn("REFUSED", error.getvalue())
                    run.assert_not_called()

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
