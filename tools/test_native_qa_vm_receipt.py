"""Synthetic receipt policy controls; no service authentication or runner execution."""
from dataclasses import replace
import hashlib
import importlib
import io
import json
import os
from pathlib import Path
import plistlib
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

try:
    policy = importlib.import_module("tools.native_qa_vm_receipt")
except ModuleNotFoundError as error:
    if error.name != "tools.native_qa_vm_receipt":
        raise
    policy = None

SOURCE = "a" * 40
OTHER_SOURCE = "b" * 40
ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "reason-machines/openconductor"
WORKFLOW = ".github/workflows/native-qa-vm-runner.yml"
BUILD_ID = "github-actions:42:101:2:compile-sign"


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def documents():
    receipt = canonical({"schema": 1, "repository": REPOSITORY,
                         "source_commit": SOURCE, "build_id": BUILD_ID,
                         "executable_sha256": hashlib.sha256(b"signed fixture").hexdigest()})
    manifest = {"schema": 1, "repository": REPOSITORY, "repository_id": 42,
                "source_commit": SOURCE, "workflow_path": WORKFLOW,
                "workflow_commit": SOURCE, "run_id": 101, "run_attempt": 2,
                "job_key": "compile-sign", "event": "push", "ref": "refs/heads/main",
                "build_id": BUILD_ID,
                "bundle_id": "com.reasonmachines.openconductor.qa-vm-runner",
                "executable": "Contents/MacOS/OpenConductorQAVMRunner",
                "architecture": "arm64", "minimum_macos": "15.0",
                "sdk_version": "15.5", "clang_version": "Apple clang version fixture",
                "signing_mode": "ad-hoc", "receipt_sha256": hashlib.sha256(receipt).hexdigest()}
    return receipt, manifest


def archive(receipt=None, manifest=None, extra=(), compression=zipfile.ZIP_DEFLATED):
    original, build = documents()
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=compression) as output:
        output.writestr("receipt.json", original if receipt is None else receipt)
        output.writestr("build.json", canonical(build if manifest is None else manifest))
        for name, data in extra:
            output.writestr(name, data)
    return stream.getvalue()


class ReceiptPolicyTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(policy, "missing inert CI receipt producer/consumer policy boundary")
        self.selection = policy.ApprovedBuild(42, SOURCE, 7, WORKFLOW, 101, 2, 501)
        module = policy

        class FakeService(module.AuthenticatedGitHubReader):
            """A test double, NOT an authenticated GitHub connection."""
            def __init__(self):
                self.payload = archive()
                self.repository = module.RepositoryMetadata(42, REPOSITORY)
                self.workflow = module.WorkflowMetadata(42, 7, WORKFLOW, SOURCE)
                self.run = module.RunMetadata(42, 42, 7, WORKFLOW, SOURCE, 101, 2,
                                              "push", "main", "completed", "success")
                self.job = module.JobMetadata(101, 2, "compile-sign",
                    "VM runner compile and signature readback (no execution)", "completed", "success")
                self.artifact = module.ArtifactMetadata(501, 42, 101, 2, SOURCE,
                    "oc-qa-vm-receipt-101-2", False, len(self.payload),
                    "sha256:" + hashlib.sha256(self.payload).hexdigest())
                self.run_reads = 0
                self.artifact_reads = 0
                self.mutate_run = False
                self.mutate_artifact = False

            def read_repository(self, repository_id):
                return self.repository

            def read_workflow(self, repository_id, workflow_id, source_commit):
                return self.workflow

            def read_run(self, repository_id, run_id):
                self.run_reads += 1
                return replace(self.run, run_attempt=3) if self.mutate_run and self.run_reads > 1 else self.run

            def read_job(self, repository_id, run_id, run_attempt, job_key):
                return self.job

            def read_artifact(self, repository_id, artifact_id):
                self.artifact_reads += 1
                return replace(self.artifact, expired=True) if self.mutate_artifact and self.artifact_reads > 1 else self.artifact

            def download_artifact(self, repository_id, artifact_id, *, max_bytes):
                return self.payload

        self.service = FakeService()

    def consume(self):
        return policy.consume_ci_receipt(self.selection, self.service)

    def set_payload(self, payload):
        self.service.payload = payload
        self.service.artifact = replace(self.service.artifact, size_bytes=len(payload),
            digest="sha256:" + hashlib.sha256(payload).hexdigest())

    def test_exact_selected_fake_service_returns_exact_receipt_not_launch_authority(self):
        result = self.consume()
        self.assertEqual(result.receipt_bytes, documents()[0])
        self.assertEqual(result.build_id, BUILD_ID)
        self.assertEqual(result.selection, self.selection)
        self.assertEqual(self.service.run_reads, 2)
        self.assertEqual(self.service.artifact_reads, 2)
        self.assertFalse(hasattr(result, "launch"))

    def test_forged_candidate_derived_receipt_cannot_authenticate_itself(self):
        forged = {"authenticated": True, "receipt": documents()[0], "archive": archive()}
        for reader in (None, forged, object()):
            with self.subTest(reader=type(reader).__name__), self.assertRaises(ValueError):
                policy.consume_ci_receipt(self.selection, reader)
        with self.assertRaises(ValueError):
            policy.consume_ci_receipt(None, self.service)

    def test_invalid_approved_selection_refuses(self):
        for field, value in (("repository_id", True), ("repository_id", 0),
                             ("workflow_id", "7"), ("run_id", -1), ("run_attempt", 0),
                             ("artifact_id", None), ("source_commit", "A" * 40),
                             ("source_commit", "main"), ("workflow_path", "other.yml")):
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                replace(self.selection, **{field: value})

    def test_repository_and_pinned_workflow_are_authoritative(self):
        for record, field, value in (("repository", "repository_id", 43),
            ("repository", "full_name", "fork/openconductor"),
            ("workflow", "repository_id", 43), ("workflow", "workflow_id", 8),
            ("workflow", "path", "wrong.yml"), ("workflow", "source_commit", OTHER_SOURCE)):
            original = getattr(self.service, record)
            with self.subTest(record=record, field=field), self.assertRaises(ValueError):
                setattr(self.service, record, replace(original, **{field: value}))
                self.consume()
            setattr(self.service, record, original)

    def test_run_identity_and_whole_run_success_required(self):
        original = self.service.run
        for field, value in (("repository_id", 43), ("head_repository_id", 99),
            ("workflow_id", 8), ("workflow_path", "wrong.yml"),
            ("source_commit", OTHER_SOURCE), ("run_id", 102), ("run_attempt", 1),
            ("event", "pull_request"), ("event", "workflow_dispatch"),
            ("branch", "topic"), ("status", "in_progress"), ("conclusion", "failure"),
            ("conclusion", "cancelled"), ("conclusion", "skipped")):
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.service.run = replace(original, **{field: value})
                self.consume()
        self.service.run = original

    def test_producer_job_success_and_attempt_required(self):
        original = self.service.job
        for field, value in (("run_id", 102), ("run_attempt", 1), ("job_key", "portable"),
            ("name", "unreviewed producer"), ("status", "queued"), ("conclusion", "skipped")):
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.service.job = replace(original, **{field: value})
                self.consume()
        self.service.job = original

    def test_missing_authoritative_broker_fields_and_service_errors_refuse(self):
        for attribute in ("repository", "workflow", "run", "job", "artifact"):
            original = getattr(self.service, attribute)
            with self.subTest(attribute=attribute), self.assertRaises(ValueError):
                setattr(self.service, attribute, None)
                self.consume()
            setattr(self.service, attribute, original)
        with patch.object(self.service, "read_artifact", side_effect=PermissionError("denied")):
            with self.assertRaises(PermissionError):
                self.consume()

    def test_artifact_identity_attempt_expiry_size_and_service_digest_required(self):
        original = self.service.artifact
        for field, value in (("artifact_id", 502), ("repository_id", 43), ("run_id", 102),
            ("run_attempt", 1), ("source_commit", OTHER_SOURCE),
            ("name", "oc-qa-vm-receipt-101-1"), ("expired", True), ("expired", 0),
            ("size_bytes", 0), ("size_bytes", len(self.service.payload) + 1),
            ("digest", None), ("digest", ""), ("digest", "sha256:" + "0" * 64)):
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.service.artifact = replace(original, **{field: value})
                self.consume()
        self.service.artifact = original

    def test_archive_tampering_and_observed_provenance_mutation_refuse(self):
        self.service.payload += b"tampered"
        with self.assertRaises(ValueError):
            self.consume()
        self.set_payload(archive())
        for attribute in ("mutate_run", "mutate_artifact"):
            self.service.run_reads = self.service.artifact_reads = 0
            setattr(self.service, attribute, True)
            with self.subTest(attribute=attribute), self.assertRaises(ValueError):
                self.consume()
            setattr(self.service, attribute, False)

    def test_archive_allowlist_rejects_extra_paths_links_and_executables(self):
        for name in ("../escape", "/absolute", "runner.app", "sub/receipt.json", "extra.json"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.set_payload(archive(extra=((name, b"payload"),)))
                self.consume()
        for mode in (stat.S_IFLNK | 0o777, stat.S_IFREG | 0o755, stat.S_IFDIR | 0o700):
            item = zipfile.ZipInfo("receipt.json")
            item.create_system = 3
            item.external_attr = mode << 16
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as output:
                output.writestr(item, documents()[0])
                output.writestr("build.json", canonical(documents()[1]))
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                self.set_payload(buffer.getvalue())
                self.consume()

    def test_nul_truncated_zip_member_name_refuses(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as output:
            output.writestr("receipt.jsonX", documents()[0])
            output.writestr("build.json", canonical(documents()[1]))
        self.set_payload(buffer.getvalue().replace(b"receipt.jsonX", b"receipt.json\0"))
        with self.assertRaises(ValueError):
            self.consume()

    def test_duplicate_zip_members_refuse(self):
        with self.assertWarns(UserWarning):
            payload = archive(extra=(("receipt.json", documents()[0]),))
        self.set_payload(payload)
        with self.assertRaises(ValueError):
            self.consume()

    def test_archive_bounds_and_unsupported_compression_refuse(self):
        for payload in (b"not zip", b"x" * (256 * 1024 + 1),
                        archive(receipt=b" " * (128 * 1024 + 1)),
                        archive(compression=zipfile.ZIP_BZIP2)):
            with self.subTest(length=len(payload)), self.assertRaises(ValueError):
                self.set_payload(payload)
                self.consume()

    def test_strict_receipt_schema_and_duplicate_json_refuse(self):
        original = json.loads(documents()[0])
        for field, value in (("schema", True), ("schema", 2), ("extra", "ignored"),
            ("repository", "fork/openconductor"), ("source_commit", OTHER_SOURCE),
            ("build_id", "other"), ("executable_sha256", "F" * 64)):
            receipt = dict(original, **{field: value})
            manifest = documents()[1]
            raw = canonical(receipt)
            manifest["receipt_sha256"] = hashlib.sha256(raw).hexdigest()
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.set_payload(archive(receipt=raw, manifest=manifest))
                self.consume()
        for raw in (b'{"schema":1,"schema":1}', b'{"schema":NaN}', b'[]', b'null', b'\xff'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                self.set_payload(archive(receipt=raw))
                self.consume()

    def test_strict_manifest_and_receipt_cross_binding(self):
        original = documents()[1]
        mutations = [(key, None) for key in original]
        mutations += [("extra", "ignored"), ("schema", True), ("repository_id", True),
                      ("run_id", 102), ("workflow_commit", OTHER_SOURCE),
                      ("signing_mode", "developer-id"), ("architecture", "x86_64"),
                      ("receipt_sha256", "0" * 64), ("clang_version", "x" * 4097)]
        for field, value in mutations:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.set_payload(archive(manifest=dict(original, **{field: value})))
                self.consume()
        for field in original:
            manifest = dict(original)
            del manifest[field]
            with self.subTest(missing=field), self.assertRaises(ValueError):
                self.set_payload(archive(manifest=manifest))
                self.consume()


class ProducerTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(policy, "missing inert CI receipt producer/consumer policy boundary")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.checkout = self.root / "checkout"
        self.checkout.mkdir()
        subprocess.run(["git", "init", "-q", str(self.checkout)], check=True)
        (self.checkout / "input.c").write_text("tracked fixture\n")
        self.git("add", "input.c")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                 "commit", "-qm", "fixture")
        self.source = self.git("rev-parse", "HEAD").strip()
        self.context = policy.CIContext(42, self.source, self.source, 101, 2,
            REPOSITORY, "push", "refs/heads/main", "compile-sign",
            REPOSITORY + "/" + WORKFLOW + "@refs/heads/main")
        self.bundle = self.root / "candidate.app"
        executable = self.bundle / "Contents/MacOS/OpenConductorQAVMRunner"
        executable.parent.mkdir(parents=True)
        executable.write_bytes(b"signed fixture")
        self.executable = executable
        self.output = self.root / "receipt"
        self.verifier = patch("tools.native_qa_vm_receipt.verify_build_identity")
        self.verify = self.verifier.start()
        self.addCleanup(self.verifier.stop)

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.checkout), *args], check=True,
                              text=True, capture_output=True).stdout

    def emit(self):
        return policy.emit_ci_receipt(self.bundle, checkout=self.checkout, ci_context=self.context,
            output_directory=self.output, sdk_version="15.5", clang_version="Apple clang fixture")

    def test_producer_emits_only_two_private_json_files_and_post_sign_hash(self):
        result = self.emit()
        self.assertEqual({p.name for p in self.output.iterdir()}, {"receipt.json", "build.json"})
        raw = result.receipt.read_bytes()
        receipt = json.loads(raw)
        self.assertEqual(receipt["executable_sha256"], hashlib.sha256(b"signed fixture").hexdigest())
        self.assertEqual(receipt["source_commit"], self.source)
        self.assertEqual(json.loads(result.manifest.read_bytes())["receipt_sha256"], hashlib.sha256(raw).hexdigest())
        self.verify.assert_called_once_with(self.bundle, build_receipt=result.receipt, expected_source=self.source)
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o700)
        self.assertTrue(all(stat.S_IMODE(p.stat().st_mode) == 0o600 for p in self.output.iterdir()))

    def test_wrong_or_dirty_checkout_and_untracked_source_refuse_before_output(self):
        self.context = replace(self.context, source_commit=SOURCE, workflow_commit=SOURCE)
        with self.assertRaises(ValueError):
            self.emit()
        self.context = replace(self.context, source_commit=self.source, workflow_commit=self.source)
        for path in (self.checkout / "input.c", self.checkout / "unexpected.c"):
            path.write_text("dirty\n")
            with self.subTest(path=path.name), self.assertRaises(ValueError):
                self.emit()
            if path.name == "input.c":
                path.write_text("tracked fixture\n")
            else:
                path.unlink()
        self.assertFalse(self.output.exists())

    def test_wrong_ci_context_refuses(self):
        original = self.context
        for field, value in (("repository_id", True), ("repository", "fork/openconductor"),
            ("source_commit", "main"), ("workflow_commit", OTHER_SOURCE), ("run_id", 0),
            ("run_attempt", 0), ("event", "pull_request"), ("ref", "refs/heads/topic"),
            ("job_key", "portable"), ("workflow_ref", "unreviewed")):
            self.context = replace(original, **{field: value})
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.emit()
        self.assertFalse(self.output.exists())

    def test_missing_context_is_not_implicitly_authenticated(self):
        with self.assertRaises(ValueError):
            policy.CIContext.from_environment({})

    def test_existing_internal_or_linked_output_refuses(self):
        self.output.mkdir()
        with self.assertRaises((ValueError, FileExistsError)):
            self.emit()
        self.output.rmdir()
        self.output = self.checkout / "receipt"
        with self.assertRaises(ValueError):
            self.emit()
        target = self.root / "actual"
        target.mkdir()
        link = self.root / "link"
        link.symlink_to(target, target_is_directory=True)
        self.output = link / "receipt"
        with self.assertRaises(ValueError):
            self.emit()

    def test_symlink_hardlink_and_mutating_post_sign_inputs_refuse(self):
        original = self.root / "original"
        self.executable.rename(original)
        self.executable.symlink_to(original)
        with self.assertRaises(ValueError):
            self.emit()
        self.executable.unlink()
        os.link(original, self.executable)
        with self.assertRaises(ValueError):
            self.emit()
        self.executable.unlink()
        original.rename(self.executable)
        self.verify.side_effect = lambda *args, **kwargs: self.executable.write_bytes(b"substituted")
        with self.assertRaises(ValueError):
            self.emit()

    def test_signature_failure_cannot_emit_usable_receipt(self):
        self.verify.side_effect = subprocess.CalledProcessError(1, "mock codesign")
        with self.assertRaises(subprocess.CalledProcessError):
            self.emit()
        self.assertFalse((self.output / "build.json").exists())


class RetainedBundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.bundle = self.root / "OpenConductorQAVMRunner.app"
        self.executable = b"signed fixture"
        receipt, manifest = documents()
        self.members = {
            "receipt.json": receipt,
            "build.json": canonical(manifest),
            "OpenConductorQAVMRunner.app/Contents/Info.plist": plistlib.dumps({
                "CFBundleIdentifier": policy.BUNDLE_ID,
                "CFBundleExecutable": "OpenConductorQAVMRunner"}),
            "OpenConductorQAVMRunner.app/Contents/MacOS/OpenConductorQAVMRunner": self.executable,
            "OpenConductorQAVMRunner.app/Contents/_CodeSignature/CodeResources": b"synthetic signature metadata",
        }
        self.receipts = self.root / "receipts"
        self.receipts.mkdir()
        for name, data in self.members.items():
            target = self.receipts / name if name.endswith(".json") else self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        self.output = self.root / "bundle.zip"

    def pack(self, members=None, modes=None):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as output:
            for name, data in (self.members if members is None else members).items():
                item = zipfile.ZipInfo(name)
                item.create_system = 3
                permission = 0o755 if "/MacOS/" in name else 0o600 if name.endswith(".json") else 0o644
                item.external_attr = ((modes or {}).get(name, stat.S_IFREG | permission)) << 16
                output.writestr(item, data)
        return stream.getvalue()

    def inspect(self, data=None, source=SOURCE, build_id=BUILD_ID):
        return policy.inspect_retained_bundle(self.pack() if data is None else data,
            expected_source=source, expected_build_id=build_id)

    def test_retention_preserves_actual_candidate_bytes_and_bound_documents(self):
        with patch.object(policy, "verify_build_identity") as verify:
            result = policy.retain_ci_bundle(self.bundle, receipt_directory=self.receipts,
                output_file=self.output, expected_source=SOURCE, expected_build_id=BUILD_ID)
        self.assertGreaterEqual(verify.call_count, 1)
        with zipfile.ZipFile(self.output) as retained:
            self.assertEqual(set(retained.namelist()), set(self.members))
            for name, data in self.members.items():
                self.assertEqual(retained.read(name), data)
            executable = retained.getinfo("OpenConductorQAVMRunner.app/Contents/MacOS/OpenConductorQAVMRunner")
            self.assertEqual(executable.external_attr >> 16, stat.S_IFREG | 0o755)
        self.assertEqual(result, self.inspect(self.output.read_bytes()))
        self.assertEqual(result.executable_sha256, hashlib.sha256(self.executable).hexdigest())
        self.assertFalse(hasattr(result, "launch"))
        self.assertFalse(hasattr(result, "admission"))

    def test_receipt_only_and_each_missing_bundle_member_refuse(self):
        with self.assertRaises(ValueError):
            self.inspect(archive())
        for name in self.members:
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.inspect(self.pack({key: data for key, data in self.members.items() if key != name}))

    def test_wrong_build_source_binary_and_receipt_binding_refuse(self):
        for source, build_id in ((OTHER_SOURCE, BUILD_ID), (SOURCE, "github-actions:42:102:2:compile-sign")):
            with self.subTest(source=source, build=build_id), self.assertRaises(ValueError):
                self.inspect(source=source, build_id=build_id)
        for name in ("OpenConductorQAVMRunner.app/Contents/MacOS/OpenConductorQAVMRunner", "receipt.json"):
            changed = dict(self.members)
            changed[name] += b"substituted"
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.inspect(self.pack(changed))

    def test_unexpected_paths_links_and_unsafe_modes_refuse_without_extraction(self):
        for name in ("../escape", "/absolute", "extra", "OpenConductorQAVMRunner.app/Contents/extra"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.inspect(self.pack({**self.members, name: b"not allowed"}))
        name = "OpenConductorQAVMRunner.app/Contents/MacOS/OpenConductorQAVMRunner"
        for mode in (stat.S_IFLNK | 0o777, stat.S_IFREG | 0o4755, stat.S_IFREG | 0o644):
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                self.inspect(self.pack(modes={name: mode}))
        self.assertFalse((self.root / "escape").exists())

    def test_duplicate_members_and_oversized_archive_refuse(self):
        data = io.BytesIO(self.pack())
        with zipfile.ZipFile(data, "a") as output:
            with self.assertWarns(UserWarning):
                output.writestr("receipt.json", self.members["receipt.json"])
        with self.assertRaises(ValueError):
            self.inspect(data.getvalue())
        with patch.object(policy, "MAX_BUNDLE_ARCHIVE", 100), self.assertRaises(ValueError):
            self.inspect()

    def test_wrong_candidate_or_signature_failure_cannot_publish_archive(self):
        binary = self.bundle / policy.EXECUTABLE
        binary.write_bytes(b"wrong build")
        with patch.object(policy, "verify_build_identity"), self.assertRaises(ValueError):
            policy.retain_ci_bundle(self.bundle, receipt_directory=self.receipts,
                output_file=self.output, expected_source=SOURCE, expected_build_id=BUILD_ID)
        self.assertFalse(self.output.exists())
        binary.write_bytes(self.executable)
        with patch.object(policy, "verify_build_identity", side_effect=ValueError("signature rejected")):
            with self.assertRaises(ValueError):
                policy.retain_ci_bundle(self.bundle, receipt_directory=self.receipts,
                    output_file=self.output, expected_source=SOURCE, expected_build_id=BUILD_ID)
        self.assertFalse(self.output.exists())

    def test_existing_output_and_linked_input_refuse(self):
        self.output.write_bytes(b"previous output")
        with patch.object(policy, "verify_build_identity"), self.assertRaises((ValueError, FileExistsError)):
            policy.retain_ci_bundle(self.bundle, receipt_directory=self.receipts,
                output_file=self.output, expected_source=SOURCE, expected_build_id=BUILD_ID)
        self.assertEqual(self.output.read_bytes(), b"previous output")
        self.output.unlink()
        path = self.bundle / policy.EXECUTABLE
        path.unlink()
        path.symlink_to(self.receipts / "receipt.json")
        with patch.object(policy, "verify_build_identity"), self.assertRaises(ValueError):
            policy.retain_ci_bundle(self.bundle, receipt_directory=self.receipts,
                output_file=self.output, expected_source=SOURCE, expected_build_id=BUILD_ID)
        self.assertFalse(self.output.exists())


class WorkflowContractTests(unittest.TestCase):
    def test_existing_workflow_has_only_two_jobs_no_new_trigger_or_permissions(self):
        source = (ROOT / WORKFLOW).read_text()
        jobs = source.split("jobs:\n", 1)[1]
        self.assertEqual([line.strip() for line in jobs.splitlines()
                          if line.startswith("  ") and not line.startswith("   ")],
                         ["portable:", "compile-sign:"])
        self.assertNotIn("workflow_dispatch", source)
        self.assertIn("permissions:\n  contents: read\n", source)
        self.assertNotIn("id-token:", source)
        self.assertNotIn("actions: write", source)

    def test_receipt_workflow_is_push_main_only_and_exactly_two_json_uploads(self):
        source = (ROOT / WORKFLOW).read_text()
        self.assertEqual(source.count("'tools/native_qa_vm_receipt.py'"), 2)
        self.assertEqual(source.count("'tools/test_native_qa_vm_receipt.py'"), 2)
        self.assertIn("tools.test_native_qa_vm_receipt", source)
        self.assertIn("github.event_name == 'push'", source)
        self.assertIn("github.ref == 'refs/heads/main'", source)
        self.assertIn("github.repository == 'reason-machines/openconductor'", source)
        self.assertIn("--ci-receipt-dir", source)
        upload = source.split("uses: actions/upload-artifact@", 1)[1]
        revision = upload.splitlines()[0].split()[0]
        self.assertRegex(revision, r"^[0-9a-f]{40}$")
        self.assertIn("success()", upload)
        self.assertIn("oc-qa-vm-receipt-${{ github.run_id }}-${{ github.run_attempt }}", upload)
        paths = upload.split("path: |\n", 1)[1].split("retention-days:", 1)[0]
        self.assertEqual([line.strip() for line in paths.splitlines() if line.strip()],
            ["${{ runner.temp }}/oc-vm-receipt/receipt.json", "${{ runner.temp }}/oc-vm-receipt/build.json"])
        for control in ("retention-days: 7", "if-no-files-found: error", "overwrite: false"):
            self.assertIn(control, upload)

    def test_signed_bundle_is_retained_separately_without_changing_receipt_allowlist(self):
        source = (ROOT / WORKFLOW).read_text()
        self.assertEqual(source.count("uses: actions/upload-artifact@"), 2)
        bundle = source.split("- name: Publish retained signed bundle", 1)[1]
        self.assertIn("github.event_name == 'push'", bundle)
        self.assertIn("github.ref == 'refs/heads/main'", bundle)
        self.assertIn("oc-qa-vm-bundle-${{ github.run_id }}-${{ github.run_attempt }}", bundle)
        self.assertIn("${{ runner.temp }}/oc-vm-bundle/bundle.zip", bundle)
        self.assertIn("overwrite: false", bundle)
        package = (ROOT / "scripts/package-native-qa-vm-runner.sh").read_text()
        self.assertLess(package.index(" emit "), package.index(" retain "))
        self.assertIn("--ci-bundle-archive", source)

    def test_package_preflight_precedes_compiler_and_emit_follows_signature(self):
        source = (ROOT / "scripts/package-native-qa-vm-runner.sh").read_text()
        self.assertLess(source.index(" preflight "), source.index("xcrun clang"))
        self.assertLess(source.index('tools/native_qa_vm_signing.py "$app"'), source.index(" emit "))
        self.assertIn('[[ $identity == - ]]', source)
        self.assertNotRegex(source, r'(?m)^\s*"\$app/Contents/MacOS/OpenConductorQAVMRunner"(?:\s|$)')
        self.assertNotIn("open -a", source)


if __name__ == "__main__":
    unittest.main()
