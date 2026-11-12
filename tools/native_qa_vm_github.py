"""Read-only GitHub provenance and retained-byte consumption. Never grants admission."""
import base64
import binascii
from dataclasses import dataclass, field
from datetime import datetime
import hashlib
from http.client import HTTPException
import io
import json
import re
import stat
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zipfile

from tools import native_qa_vm_receipt as policy

API = "https://api.github.com"
MAX_METADATA = 2 * 1024 * 1024
MAX_DOWNLOAD = policy.MAX_BUNDLE_ARCHIVE + 64 * 1024


@dataclass(frozen=True)
class ApprovedGitHubBuild:
    """Caller-reviewed coordinates and workflow bytes, never selected from a candidate.

    The reviewed workflow digest binds the compile-sign key to its unique fixed
    job name. GitHub's job API exposes the name and numeric ID, not the YAML key.
    The job ID must independently identify that producer in the selected attempt.
    """
    receipt: policy.ApprovedBuild
    producer_job_id: int
    bundle_artifact_id: int
    workflow_sha256: str

    def __post_init__(self):
        policy._require(type(self.receipt) is policy.ApprovedBuild,
                        "independently selected build required")
        self.receipt.__post_init__()
        policy._require(policy._positive(self.producer_job_id)
                        and policy._positive(self.bundle_artifact_id)
                        and self.bundle_artifact_id != self.receipt.artifact_id
                        and policy._hex(self.workflow_sha256, 64),
                        "independent producer job, bundle artifact and reviewed workflow required")


@dataclass(frozen=True)
class ConsumedGitHubBundle:
    receipt: policy.ValidatedCIReceipt
    bundle: policy.RetainedBundle
    bundle_artifact_id: int
    service_archive_sha256: str
    bundle_archive: bytes = field(repr=False)


def _equal(actual, expected):
    policy._require(type(actual) is type(expected) and actual == expected,
                    "missing or mismatched GitHub identity")


def _time(value):
    policy._require(type(value) is str and re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", value) is not None,
        "authoritative UTC service timestamp required")
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        raise ValueError("invalid service timestamp") from None


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


class GitHubReader(policy.AuthenticatedGitHubReader):
    """Concrete fixed-origin GET reader with an explicitly supplied credential.

    Only the artifact ZIP endpoint may redirect, once, to a service-supplied
    GitHub storage URL. That request never receives the GitHub credential.
    No environment credential lookup, latest-build selection, writes, extraction,
    signature verification, launch or resource capability is implemented.
    """
    def __init__(self, approved: ApprovedGitHubBuild, token: str):
        policy._require(type(approved) is ApprovedGitHubBuild,
                        "explicit reviewed GitHub build required")
        approved.__post_init__()
        policy._require(type(token) is str and 0 < len(token) <= 4096
                        and re.fullmatch(r"[!-~]+", token) is not None,
                        "explicit GitHub credential required")
        self.approved = approved
        self._token = token
        self._opener = build_opener(_NoRedirect())
        selected = approved.receipt
        self._root = f"/repos/{policy.REPOSITORY}"
        self._paths = {self._root,
            f"{self._root}/actions/workflows/{selected.workflow_id}",
            f"{self._root}/contents/{policy.WORKFLOW}?ref={selected.source_commit}",
            f"{self._root}/actions/runs/{selected.run_id}",
            f"{self._root}/actions/jobs/{approved.producer_job_id}"}
        for artifact in (selected.artifact_id, approved.bundle_artifact_id):
            path = f"{self._root}/actions/artifacts/{artifact}"
            self._paths.update((path, path + "/zip"))

    def _open(self, request):
        try:
            return self._opener.open(request, timeout=30)
        except HTTPError as response:
            return response

    def _request(self, path, limit, *, archive=False):
        policy._require(path in self._paths and type(limit) is int and 0 < limit <= MAX_DOWNLOAD,
                        "request outside selected read-only GitHub scope")
        headers = {"Authorization": "Bearer " + self._token,
                   "Accept": "application/vnd.github+json",
                   "X-GitHub-Api-Version": "2022-11-28",
                   "User-Agent": "OpenConductor-QA-read-only"}
        request = Request(API + path, headers=headers, method="GET")
        try:
            with self._open(request) as response:
                if archive and response.status == 302:
                    location = response.headers.get("Location")
                    policy._require(type(location) is str and len(location) <= 16384
                                    and not any(ord(c) < 33 or ord(c) > 126 for c in location),
                                    "invalid artifact redirect")
                    url = urlsplit(location)
                    policy._require(url.scheme == "https" and url.username is None
                                    and url.password is None and url.port is None and not url.fragment
                                    and url.netloc == url.hostname and re.fullmatch(
                                        r"productionresultssa[0-9]+\.blob\.core\.windows\.net", url.hostname or "")
                                    is not None, "artifact redirect outside GitHub storage")
                else:
                    policy._require(response.status == 200, "GitHub GET did not succeed")
                    data = response.read(limit + 1)
                    policy._require(type(data) is bytes and 0 < len(data) <= limit,
                                    "GitHub response exceeds selected byte limit")
                    return data
            with self._open(Request(location, headers={"User-Agent": "OpenConductor-QA-read-only"},
                                    method="GET")) as response:
                policy._require(response.status == 200, "artifact GET did not succeed")
                data = response.read(limit + 1)
                policy._require(type(data) is bytes and 0 < len(data) <= limit,
                                "artifact response exceeds selected byte limit")
                return data
        except (OSError, ValueError, HTTPException):
            # urllib errors can include the credential-bearing request or signed URL.
            raise ValueError("selected GitHub read refused or unavailable") from None

    def _json(self, path):
        data = self._request(path, MAX_METADATA)
        try:
            result = json.loads(data.decode("utf-8"), object_pairs_hook=policy._unique,
                                parse_constant=policy._nonfinite)
        except (UnicodeError, ValueError, RecursionError):
            raise ValueError("invalid bounded GitHub JSON") from None
        policy._require(type(result) is dict, "GitHub object response required")
        return result

    def _repository(self, repository_id):
        _equal(repository_id, self.approved.receipt.repository_id)

    def read_repository(self, repository_id: int) -> policy.RepositoryMetadata:
        self._repository(repository_id)
        value = self._json(self._root)
        _equal(value.get("id"), repository_id)
        _equal(value.get("full_name"), policy.REPOSITORY)
        return policy.RepositoryMetadata(repository_id, policy.REPOSITORY)

    def read_workflow(self, repository_id: int, workflow_id: int,
                      source_commit: str) -> policy.WorkflowMetadata:
        self._repository(repository_id)
        selected = self.approved.receipt
        _equal(workflow_id, selected.workflow_id)
        _equal(source_commit, selected.source_commit)
        value = self._json(f"{self._root}/actions/workflows/{workflow_id}")
        _equal(value.get("id"), workflow_id)
        _equal(value.get("path"), policy.WORKFLOW)
        contents = self._json(f"{self._root}/contents/{policy.WORKFLOW}?ref={source_commit}")
        for key, expected in (("type", "file"), ("path", policy.WORKFLOW), ("encoding", "base64")):
            _equal(contents.get(key), expected)
        encoded = contents.get("content")
        policy._require(type(encoded) is str, "pinned workflow content missing")
        try:
            raw = base64.b64decode(encoded.replace("\n", ""), validate=True)
        except (ValueError, binascii.Error):
            raise ValueError("invalid pinned workflow encoding") from None
        _equal(hashlib.sha256(raw).hexdigest(), self.approved.workflow_sha256)
        blob = b"blob " + str(len(raw)).encode() + b"\0" + raw
        _equal(contents.get("sha"), hashlib.sha1(blob).hexdigest())
        return policy.WorkflowMetadata(repository_id, workflow_id, policy.WORKFLOW, source_commit)

    def read_run(self, repository_id: int, run_id: int) -> policy.RunMetadata:
        self._repository(repository_id)
        selected = self.approved.receipt
        _equal(run_id, selected.run_id)
        value = self._json(f"{self._root}/actions/runs/{run_id}")
        for key in ("repository", "head_repository"):
            policy._require(type(value.get(key)) is dict, "run repository linkage missing")
            _equal(value[key].get("id"), repository_id)
        for key, expected in (("id", run_id), ("workflow_id", selected.workflow_id),
            ("path", policy.WORKFLOW), ("head_sha", selected.source_commit),
            ("run_attempt", selected.run_attempt), ("event", "push"), ("head_branch", "main"),
            ("status", "completed"), ("conclusion", "success")):
            _equal(value.get(key), expected)
        return policy.RunMetadata(repository_id, repository_id, selected.workflow_id, policy.WORKFLOW,
            selected.source_commit, run_id, selected.run_attempt, "push", "main", "completed", "success")

    def _job(self):
        selected = self.approved.receipt
        value = self._json(f"{self._root}/actions/jobs/{self.approved.producer_job_id}")
        for key, expected in (("id", self.approved.producer_job_id), ("run_id", selected.run_id),
            ("run_attempt", selected.run_attempt), ("head_sha", selected.source_commit),
            ("name", policy.JOB_NAME), ("status", "completed"), ("conclusion", "success")):
            _equal(value.get(key), expected)
        start, end = _time(value.get("started_at")), _time(value.get("completed_at"))
        policy._require(start < end, "completed producer job lifetime required")
        return start, end

    def read_job(self, repository_id: int, run_id: int, run_attempt: int,
                 job_key: str) -> policy.JobMetadata:
        self._repository(repository_id)
        selected = self.approved.receipt
        _equal(run_id, selected.run_id)
        _equal(run_attempt, selected.run_attempt)
        _equal(job_key, policy.JOB)
        self._job()
        return policy.JobMetadata(run_id, run_attempt, job_key, policy.JOB_NAME, "completed", "success")

    def read_artifact(self, repository_id: int, artifact_id: int) -> policy.ArtifactMetadata:
        self._repository(repository_id)
        selected = self.approved.receipt
        policy._require(type(artifact_id) is int and artifact_id in
                        (selected.artifact_id, self.approved.bundle_artifact_id),
                        "artifact outside approved selection")
        value = self._json(f"{self._root}/actions/artifacts/{artifact_id}")
        kind = "receipt" if artifact_id == selected.artifact_id else "bundle"
        name = f"oc-qa-vm-{kind}-{selected.run_id}-{selected.run_attempt}"
        for key, expected in (("id", artifact_id), ("name", name), ("expired", False)):
            _equal(value.get(key), expected)
        run = value.get("workflow_run")
        policy._require(type(run) is dict, "artifact service run linkage required")
        for key, expected in (("id", selected.run_id), ("repository_id", repository_id),
            ("head_repository_id", repository_id), ("head_sha", selected.source_commit),
            ("head_branch", "main")):
            _equal(run.get(key), expected)
        # Artifact REST has no run_attempt. Bind its service creation/update times
        # to the selected numeric producer job's exact service-reported attempt.
        start, end = self._job()
        policy._require(start <= _time(value.get("created_at")) <= _time(value.get("updated_at")) <= end,
                        "artifact outside selected producer attempt lifetime")
        size, digest = value.get("size_in_bytes"), value.get("digest")
        limit = policy.MAX_ARCHIVE if kind == "receipt" else MAX_DOWNLOAD
        policy._require(policy._positive(size) and size <= limit and type(digest) is str
                        and digest.startswith("sha256:") and policy._hex(digest[7:], 64),
                        "service artifact size and digest required")
        return policy.ArtifactMetadata(artifact_id, repository_id, selected.run_id,
            selected.run_attempt, selected.source_commit, name, False, size, digest)

    def download_artifact(self, repository_id: int, artifact_id: int, *, max_bytes: int) -> bytes:
        self._repository(repository_id)
        value = self.read_artifact(repository_id, artifact_id)
        policy._require(type(max_bytes) is int and 0 < value.size_bytes <= max_bytes <= MAX_DOWNLOAD,
                        "bounded artifact download required")
        data = self._request(f"{self._root}/actions/artifacts/{artifact_id}/zip", max_bytes, archive=True)
        policy._require(len(data) == value.size_bytes and
                        hashlib.sha256(data).hexdigest() == value.digest[7:],
                        "artifact bytes differ from service digest")
        return data

    def consume_bundle(self) -> ConsumedGitHubBundle:
        """Return exact retained bytes and provenance, without extraction or launch."""
        selected = self.approved.receipt
        receipt = policy.consume_ci_receipt(selected, self)
        metadata = self.read_artifact(selected.repository_id, self.approved.bundle_artifact_id)
        data = self.download_artifact(selected.repository_id, metadata.artifact_id, max_bytes=MAX_DOWNLOAD)
        policy._require(hashlib.sha256(data).hexdigest() == metadata.digest[7:],
                        "bundle artifact changed between reads")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as outer:
                entries = outer.infolist()
                policy._require(len(entries) == 1, "exactly one retained archive required")
                item = entries[0]
                mode = item.external_attr >> 16
                policy._require(item.orig_filename == item.filename == "bundle.zip"
                                and not item.is_dir() and not item.flag_bits & 1
                                and stat.S_IFMT(mode) in (0, stat.S_IFREG) and not mode & 0o7111
                                and item.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                                and 0 < item.file_size <= policy.MAX_BUNDLE_ARCHIVE,
                                "invalid retained artifact member")
                with outer.open(item) as stream:
                    inner = stream.read(policy.MAX_BUNDLE_ARCHIVE + 1)
                policy._require(len(inner) == item.file_size, "retained artifact size mismatch")
            bundle = policy.inspect_retained_bundle(inner, expected_source=selected.source_commit,
                                                    expected_build_id=receipt.build_id)
            with zipfile.ZipFile(io.BytesIO(inner)) as archive:
                _equal(archive.read("receipt.json"), receipt.receipt_bytes)
        except (zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError):
            raise ValueError("unreadable retained artifact") from None
        policy._record(self.read_artifact(selected.repository_id, metadata.artifact_id), metadata)
        _equal(policy.consume_ci_receipt(selected, self), receipt)
        return ConsumedGitHubBundle(receipt, bundle, metadata.artifact_id, metadata.digest[7:], inner)
