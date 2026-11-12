"""Synthetic HTTP/service contracts, not live GitHub authentication or confinement."""
import base64
from dataclasses import replace
import hashlib
from http.client import IncompleteRead
import importlib
import io
import json
from pathlib import Path
from urllib.error import HTTPError
import plistlib
import stat
import unittest
from unittest.mock import patch
import zipfile

from tools import native_qa_vm_receipt as policy
from tools.test_native_qa_vm_receipt import SOURCE, BUILD_ID, archive, canonical, documents

try:
    broker = importlib.import_module("tools.native_qa_vm_github")
except ModuleNotFoundError as error:
    if error.name != "tools.native_qa_vm_github":
        raise
    broker = None

TOKEN = "synthetic-test-credential"
ROOT = "/repos/reason-machines/openconductor"
WORKFLOW_BYTES = b"reviewed workflow fixture, not executable source"
SIGNED_URL = "https://productionresultssa1.blob.core.windows.net/test/archive?sig=fixture"


def retained_bundle(receipt_bytes=None):
    receipt, manifest = documents()
    if receipt_bytes is not None:
        receipt = receipt_bytes
        manifest["receipt_sha256"] = hashlib.sha256(receipt).hexdigest()
    members = {"receipt.json": receipt, "build.json": canonical(manifest),
        f"{policy.BUNDLE_ROOT}/{policy.EXECUTABLE}": b"signed fixture",
        f"{policy.BUNDLE_ROOT}/Contents/Info.plist": plistlib.dumps({
            "CFBundleIdentifier": policy.BUNDLE_ID,
            "CFBundleExecutable": "OpenConductorQAVMRunner"}),
        f"{policy.BUNDLE_ROOT}/Contents/_CodeSignature/CodeResources": b"signature fixture"}
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as output:
        for name, contents in members.items():
            item = zipfile.ZipInfo(name)
            item.create_system = 3
            item.external_attr = (stat.S_IFREG | policy.BUNDLE_MEMBERS[name][1]) << 16
            output.writestr(item, contents)
    return buffer.getvalue()


def outer_bundle(inner):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as output:
        output.writestr("bundle.zip", inner)
    return buffer.getvalue()


class Response(io.BytesIO):
    def __init__(self, data, status=200, headers=None):
        super().__init__(data)
        self.status = status
        self.headers = headers or {}
        self.read_sizes = []

    def read(self, size=-1):
        self.read_sizes.append(size)
        return super().read(size)


class GitHubReaderTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(broker, "missing concrete bounded authenticated GitHub reader")
        self.selected = policy.ApprovedBuild(42, SOURCE, 7, policy.WORKFLOW, 101, 2, 501)
        self.approval = broker.ApprovedGitHubBuild(self.selected, 901, 502,
            hashlib.sha256(WORKFLOW_BYTES).hexdigest())
        self.inner = retained_bundle()
        self.archives = {501: archive(), 502: outer_bundle(self.inner)}
        self.repository = {"id": 42, "full_name": policy.REPOSITORY}
        self.workflow = {"id": 7, "path": policy.WORKFLOW}
        self.content = {"type": "file", "path": policy.WORKFLOW,
            "encoding": "base64", "content": base64.b64encode(WORKFLOW_BYTES).decode(),
            "sha": hashlib.sha1(b"blob " + str(len(WORKFLOW_BYTES)).encode() + b"\0" + WORKFLOW_BYTES).hexdigest()}
        self.run = {"id": 101, "repository": {"id": 42}, "head_repository": {"id": 42},
            "workflow_id": 7, "path": policy.WORKFLOW, "head_sha": SOURCE, "run_attempt": 2,
            "event": "push", "head_branch": "main", "status": "completed", "conclusion": "success"}
        self.job = {"id": 901, "run_id": 101, "run_attempt": 2, "head_sha": SOURCE,
            "name": policy.JOB_NAME, "status": "completed", "conclusion": "success",
            "started_at": "2026-11-12T03:00:00Z", "completed_at": "2026-11-12T03:01:00Z"}
        self.artifacts = {identity: self.artifact(identity) for identity in self.archives}
        self.calls = []
        self.responses = []
        self.redirect = SIGNED_URL
        self.reader = broker.GitHubReader(self.approval, TOKEN)
        self.opener = patch.object(self.reader, "_open", side_effect=self.open)
        self.opener.start()
        self.addCleanup(self.opener.stop)

    def artifact(self, identity):
        raw = self.archives[identity]
        return {"id": identity, "name": f"oc-qa-vm-{'receipt' if identity == 501 else 'bundle'}-101-2",
            "expired": False, "size_in_bytes": len(raw),
            "digest": "sha256:" + hashlib.sha256(raw).hexdigest(),
            "created_at": "2026-11-12T03:00:40Z", "updated_at": "2026-11-12T03:00:41Z",
            "workflow_run": {"id": 101, "repository_id": 42, "head_repository_id": 42,
                             "head_sha": SOURCE, "head_branch": "main"}}

    def open(self, request):
        self.calls.append(request)
        url = request.full_url
        if url.startswith(SIGNED_URL):
            identity = int(url.rsplit("=", 1)[1])
            result = Response(self.archives[identity])
        else:
            path = url.removeprefix("https://api.github.com")
            records = {ROOT: self.repository, ROOT + "/actions/workflows/7": self.workflow,
                ROOT + f"/contents/{policy.WORKFLOW}?ref={SOURCE}": self.content,
                ROOT + "/actions/runs/101": self.run, ROOT + "/actions/jobs/901": self.job}
            if path.endswith("/zip"):
                identity = int(path.split("/")[-2])
                result = Response(b"", 302, {"Location": self.redirect + "&id=" + str(identity)})
            else:
                value = records.get(path)
                if "/actions/artifacts/" in path:
                    value = self.artifacts[int(path.rsplit("/", 1)[1])]
                if value is None:
                    raise AssertionError(f"unexpected API path {path}")
                result = Response(json.dumps(value).encode())
        self.responses.append(result)
        return result

    def consume(self):
        return self.reader.consume_bundle()

    def test_selected_service_bytes_return_bound_bundle_without_authority(self):
        result = self.consume()
        self.assertEqual(result.receipt.receipt_bytes, documents()[0])
        self.assertEqual(result.bundle.build_id, BUILD_ID)
        self.assertEqual(result.bundle.executable_sha256, hashlib.sha256(b"signed fixture").hexdigest())
        self.assertEqual(result.bundle_archive, self.inner)
        self.assertEqual(result.bundle_artifact_id, 502)
        self.assertFalse(hasattr(result, "launch"))
        self.assertFalse(hasattr(result, "admission"))
        for request in self.calls:
            self.assertEqual(request.get_method(), "GET")
            if request.full_url.startswith("https://api.github.com/"):
                self.assertEqual(request.get_header("Authorization"), "Bearer " + TOKEN)
            else:
                self.assertIsNone(request.get_header("Authorization"))
        self.assertTrue(all(size > 0 for response in self.responses for size in response.read_sizes))
        self.assertTrue(all(response.closed for response in self.responses))
        self.assertNotIn(TOKEN, repr(self.reader))
        self.assertNotIn("signed fixture", repr(result))

    def test_independent_selection_and_credentials_required_before_network(self):
        for value in ("", "bad\nheader", "with space", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                broker.GitHubReader(self.approval, value)
        for key, value in (("producer_job_id", True), ("producer_job_id", 0),
                           ("bundle_artifact_id", 501), ("workflow_sha256", "latest")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                replace(self.approval, **{key: value})
        self.assertEqual(self.calls, [])

    def test_repository_workflow_and_pinned_source_refuse_mismatch(self):
        for record, key, value in ((self.repository, "id", 43), (self.repository, "full_name", "fork/repo"),
            (self.workflow, "id", 8), (self.workflow, "path", "other.yml"),
            (self.content, "path", "other.yml"), (self.content, "sha", "0" * 40),
            (self.content, "encoding", "utf-8"), (self.content, "content", "!!!!")):
            original = record[key]
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                record[key] = value
                self.consume()
            record[key] = original
        changed = base64.b64encode(b"substituted workflow").decode()
        self.content["content"] = changed
        with self.assertRaises(ValueError):
            self.consume()

    def test_each_run_coordinate_and_success_required(self):
        for key, value in (("id", 102), ("repository", {"id": 43}),
            ("head_repository", {"id": 99}), ("workflow_id", 8), ("path", "wrong.yml"),
            ("head_sha", "b" * 40), ("run_attempt", 1), ("run_attempt", True),
            ("event", "pull_request"), ("head_branch", "topic"),
            ("status", "queued"), ("conclusion", "failure")):
            old = self.run[key]
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.run[key] = value
                self.consume()
            self.run[key] = old

    def test_exact_job_attempt_not_name_alone_required(self):
        for key, value in (("id", 902), ("run_id", 102), ("run_attempt", 1),
            ("head_sha", "b" * 40), ("name", "other job"), ("status", "queued"),
            ("conclusion", "skipped"), ("started_at", None), ("completed_at", "yesterday")):
            old = self.job[key]
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.job[key] = value
                self.consume()
            self.job[key] = old

    def test_artifact_linkage_digest_expiry_and_attempt_window_required(self):
        for identity in (501, 502):
            record = self.artifacts[identity]
            mutations = (("id", 900), ("name", "oc-qa-vm-bundle-101-1"), ("expired", True),
                ("expired", 0), ("digest", None), ("digest", "sha256:" + "0" * 64),
                ("size_in_bytes", True), ("size_in_bytes", 0),
                ("created_at", "2026-11-12T02:00:00Z"), ("updated_at", "2026-11-12T04:00:00Z"),
                ("workflow_run", {"id": 101}), ("workflow_run", {**record["workflow_run"], "head_repository_id": 99}))
            for key, value in mutations:
                old = record[key]
                with self.subTest(identity=identity, key=key), self.assertRaises(ValueError):
                    record[key] = value
                    self.consume()
                record[key] = old

    def test_missing_authoritative_fields_never_filled_from_receipts(self):
        for record in (self.repository, self.workflow, self.run, self.job, self.artifacts[501], self.artifacts[502]):
            for key in list(record):
                value = record.pop(key)
                with self.subTest(key=key), self.assertRaises(ValueError):
                    self.consume()
                record[key] = value

    def test_receipt_only_wrong_binary_and_wrong_build_bundle_refuse(self):
        for inner in (archive(), self.inner.replace(b"signed fixture", b"forged fixture"),
                      self.inner.replace(SOURCE.encode(), ("b" * 40).encode())):
            self.archives[502] = outer_bundle(inner)
            self.artifacts[502] = self.artifact(502)
            with self.subTest(size=len(inner)), self.assertRaises(ValueError):
                self.consume()

    def test_outer_archive_allowlist_and_bounds(self):
        for member in ("../bundle.zip", "receipt.json", "/bundle.zip"):
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, "w") as output:
                output.writestr(member, self.inner)
            self.archives[502] = stream.getvalue()
            self.artifacts[502] = self.artifact(502)
            with self.subTest(member=member), self.assertRaises(ValueError):
                self.consume()
        self.archives[502] = outer_bundle(self.inner)
        self.artifacts[502] = self.artifact(502)
        with patch.object(broker, "MAX_DOWNLOAD", 100), self.assertRaises(ValueError):
            self.consume()

    def test_metadata_mutation_on_post_download_recheck_refuses(self):
        original = self.open
        def mutate(request):
            response = original(request)
            if request.full_url.startswith(SIGNED_URL):
                self.run["run_attempt"] = 3
            return response
        self.reader._open.side_effect = mutate
        with self.assertRaises(ValueError):
            self.consume()

    def test_untrusted_coordinates_and_redirects_never_send_credentials(self):
        for args in ((43,), (True,)):
            with self.assertRaises(ValueError):
                self.reader.read_repository(*args)
        for url in ("http://productionresultssa1.blob.core.windows.net/a", "https://evil.example/a",
            "https://api.github.com/evil", "https://user@productionresultssa1.blob.core.windows.net/a",
            "https://productionresultssa1.blob.core.windows.net:443/a", "https://127.0.0.1/a"):
            self.calls.clear()
            self.redirect = url
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.consume()
            self.assertTrue(all(x.full_url.startswith("https://api.github.com/") for x in self.calls))

    def test_api_redirects_non_successes_and_sensitive_errors_are_sanitized(self):
        for status in (301, 302, 401, 403, 429, 500):
            self.reader._open.side_effect = lambda request: Response(b"sensitive body", status)
            with self.subTest(status=status), self.assertRaises(ValueError) as error:
                self.consume()
            self.assertNotIn("sensitive", str(error.exception))
        for failure in (OSError(TOKEN + SIGNED_URL), IncompleteRead(TOKEN.encode())):
            self.reader._open.side_effect = failure
            with self.subTest(failure=type(failure).__name__), self.assertRaises(ValueError) as error:
                self.consume()
            self.assertNotIn(TOKEN, str(error.exception))
            self.assertIsNone(error.exception.__cause__)
            self.assertTrue(error.exception.__suppress_context__)

    def test_duplicate_json_and_oversize_response_refuse(self):
        for body in (b'{"id":42,"id":42}', b'[]', b'{"id":NaN}', b"x" * (2 * 1024 * 1024 + 1)):
            self.reader._open.side_effect = lambda request: Response(body)
            with self.subTest(size=len(body)), self.assertRaises(ValueError):
                self.consume()

    def test_consistent_bundle_cannot_substitute_the_consumed_receipt_bytes(self):
        self.archives[502] = outer_bundle(retained_bundle(b" " + documents()[0]))
        self.artifacts[502] = self.artifact(502)
        with self.assertRaises(ValueError):
            self.consume()

    def test_second_redirect_and_changed_bundle_metadata_refuse(self):
        original = self.open
        def second_redirect(request):
            if request.full_url.startswith(SIGNED_URL):
                response = Response(b"", 302, {"Location": "https://evil.example/"})
                self.responses.append(response)
                return response
            return original(request)
        self.reader._open.side_effect = second_redirect
        with self.assertRaises(ValueError):
            self.consume()
        self.assertTrue(all(response.closed for response in self.responses))
        def mutate(request):
            response = original(request)
            if request.full_url == SIGNED_URL + "&id=502":
                self.artifacts[502]["expired"] = True
            return response
        self.reader._open.side_effect = mutate
        with self.assertRaises(ValueError):
            self.consume()

    def test_default_transport_disables_redirects_and_closes_http_errors(self):
        handlers = [handler for handler in self.reader._opener.handlers
                    if isinstance(handler, broker._NoRedirect)]
        self.assertEqual(len(handlers), 1)
        self.assertIsNone(handlers[0].redirect_request(None, None, 302, "", {}, SIGNED_URL))
        self.opener.stop()
        body = io.BytesIO(b"sensitive service response")
        error = HTTPError("https://api.github.com/" + TOKEN, 401, "denied", {}, body)
        with patch.object(self.reader._opener, "open", side_effect=error):
            with self.assertRaises(ValueError) as result:
                self.consume()
        self.assertTrue(body.closed)
        self.assertNotIn(TOKEN, str(result.exception))
        self.assertIsNone(result.exception.__cause__)

    def test_workflow_runs_new_contract_without_new_job_or_trigger(self):
        source = (Path(__file__).resolve().parents[1] / policy.WORKFLOW).read_text()
        self.assertEqual(source.count("'tools/native_qa_vm_github.py'"), 2)
        self.assertEqual(source.count("'tools/test_native_qa_vm_github.py'"), 2)
        self.assertIn("tools.test_native_qa_vm_github", source)
        self.assertNotIn("workflow_dispatch", source)


if __name__ == "__main__":
    unittest.main()
