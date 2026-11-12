"""Inert CI receipt production and broker-backed policy. Never grants launch authority."""
from abc import ABC, abstractmethod
import argparse
from dataclasses import dataclass
import hashlib
import io
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import subprocess
import zipfile

from tools.native_qa_vm_signing import verify_build_identity

REPOSITORY = "reason-machines/openconductor"
WORKFLOW = ".github/workflows/native-qa-vm-runner.yml"
JOB = "compile-sign"
JOB_NAME = "VM runner compile and signature readback (no execution)"
BUNDLE_ID = "com.reasonmachines.openconductor.qa-vm-runner"
EXECUTABLE = "Contents/MacOS/OpenConductorQAVMRunner"
MAX_ARCHIVE = 256 * 1024
MAX_JSON = 64 * 1024
MAX_BUNDLE_ARCHIVE = 36 * 1024 * 1024
BUNDLE_ROOT = "OpenConductorQAVMRunner.app"
BUNDLE_MEMBERS = {
    "receipt.json": (MAX_JSON, 0o600),
    "build.json": (MAX_JSON, 0o600),
    f"{BUNDLE_ROOT}/Contents/Info.plist": (1024 * 1024, 0o644),
    f"{BUNDLE_ROOT}/{EXECUTABLE}": (32 * 1024 * 1024, 0o755),
    f"{BUNDLE_ROOT}/Contents/_CodeSignature/CodeResources": (1024 * 1024, 0o644),
}


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _positive(value):
    return type(value) is int and value > 0


def _hex(value, length):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{%d}" % length, value) is not None


def _text(value, limit=1024):
    return isinstance(value, str) and 0 < len(value) <= limit and "\0" not in value and bool(value.strip())


def _build_id(repository_id, run_id, run_attempt):
    return f"github-actions:{repository_id}:{run_id}:{run_attempt}:{JOB}"


@dataclass(frozen=True)
class ApprovedBuild:
    """Selection independently approved outside the candidate and artifact contents."""
    repository_id: int
    source_commit: str
    workflow_id: int
    workflow_path: str
    run_id: int
    run_attempt: int
    artifact_id: int

    def __post_init__(self):
        _require(all(_positive(x) for x in (self.repository_id, self.workflow_id,
                 self.run_id, self.run_attempt, self.artifact_id))
                 and _hex(self.source_commit, 40) and self.workflow_path == WORKFLOW,
                 "explicit exact-source repository/workflow/run/artifact selection required")


@dataclass(frozen=True)
class RepositoryMetadata:
    repository_id: int
    full_name: str


@dataclass(frozen=True)
class WorkflowMetadata:
    repository_id: int
    workflow_id: int
    path: str
    source_commit: str


@dataclass(frozen=True)
class RunMetadata:
    repository_id: int
    head_repository_id: int
    workflow_id: int
    workflow_path: str
    source_commit: str
    run_id: int
    run_attempt: int
    event: str
    branch: str
    status: str
    conclusion: str


@dataclass(frozen=True)
class JobMetadata:
    run_id: int
    run_attempt: int
    job_key: str
    name: str
    status: str
    conclusion: str


@dataclass(frozen=True)
class ArtifactMetadata:
    artifact_id: int
    repository_id: int
    run_id: int
    run_attempt: int
    source_commit: str
    name: str
    expired: bool
    size_bytes: int
    digest: str


class AuthenticatedGitHubReader(ABC):
    """Trusted integration boundary, NOT an authentication flag or implementation.

    A broker must obtain these facts and bytes from the authenticated GitHub
    service, never local JSON, logs, candidate URLs or receipt claims. It must
    resolve numeric repository linkage, the workflow at the pinned source,
    exact producer job/attempt and the service archive digest without guessing.
    Missing authoritative fields must raise or return an invalid record.
    The fixed-origin implementation is tools.native_qa_vm_github.GitHubReader.
    Subclassing alone cannot authenticate a service; fake readers are policy tests.
    """
    @abstractmethod
    def read_repository(self, repository_id):
        raise NotImplementedError

    @abstractmethod
    def read_workflow(self, repository_id, workflow_id, source_commit):
        raise NotImplementedError

    @abstractmethod
    def read_run(self, repository_id, run_id):
        raise NotImplementedError

    @abstractmethod
    def read_job(self, repository_id, run_id, run_attempt, job_key):
        raise NotImplementedError

    @abstractmethod
    def read_artifact(self, repository_id, artifact_id):
        raise NotImplementedError

    @abstractmethod
    def download_artifact(self, repository_id, artifact_id, *, max_bytes):
        """Fetch the selected immutable artifact with a transport-enforced byte cap."""
        raise NotImplementedError


@dataclass(frozen=True)
class ValidatedCIReceipt:
    receipt_bytes: bytes
    build_id: str
    selection: ApprovedBuild
    artifact_sha256: str


def _record(actual, expected):
    _require(type(actual) is type(expected) and actual == expected
             and all(type(getattr(actual, key)) is type(value)
                     for key, value in vars(expected).items()),
             "missing or mismatched authoritative GitHub metadata")


def _unique(pairs):
    result = {}
    for key, value in pairs:
        _require(key not in result, "duplicate JSON field")
        result[key] = value
    return result


def _nonfinite(value):
    raise ValueError("non-finite JSON number")


def _json(data):
    _require(type(data) is bytes and 0 < len(data) <= MAX_JSON, "JSON size limit")
    try:
        result = json.loads(data.decode("utf-8"), object_pairs_hook=_unique,
                            parse_constant=_nonfinite)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise ValueError("invalid bounded JSON") from error
    _require(type(result) is dict, "JSON object required")
    return result


def _canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()


def _documents(receipt_bytes, manifest_bytes, *, repository_id, source_commit, run_id, run_attempt):
    receipt = _json(receipt_bytes)
    manifest = _json(manifest_bytes)
    build_id = _build_id(repository_id, run_id, run_attempt)
    _require(receipt.keys() == {"schema", "repository", "source_commit", "build_id", "executable_sha256"}
             and type(receipt["schema"]) is int and receipt["schema"] == 1
             and receipt["repository"] == REPOSITORY and receipt["source_commit"] == source_commit
             and receipt["build_id"] == build_id and _hex(receipt["executable_sha256"], 64),
             "invalid exact-source receipt")
    fixed = {"schema": 1, "repository": REPOSITORY, "repository_id": repository_id,
             "source_commit": source_commit, "workflow_path": WORKFLOW,
             "workflow_commit": source_commit, "run_id": run_id, "run_attempt": run_attempt,
             "job_key": JOB, "event": "push", "ref": "refs/heads/main", "build_id": build_id,
             "bundle_id": BUNDLE_ID, "executable": EXECUTABLE, "architecture": "arm64",
             "minimum_macos": "15.0", "signing_mode": "ad-hoc",
             "receipt_sha256": hashlib.sha256(receipt_bytes).hexdigest()}
    _require(manifest.keys() == fixed.keys() | {"sdk_version", "clang_version"}
             and all(type(manifest[key]) is type(value) and manifest[key] == value
                     for key, value in fixed.items())
             and _text(manifest["sdk_version"], 64)
             and re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,2}", manifest["sdk_version"]) is not None
             and _text(manifest["clang_version"]), "invalid build manifest or receipt binding")
    return build_id


def _archive_documents(data):
    _require(type(data) is bytes and 0 < len(data) <= MAX_ARCHIVE and data.startswith(b"PK\x03\x04"),
             "invalid or oversized receipt archive")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            _require(len(entries) == 2 and {x.filename for x in entries} == {"receipt.json", "build.json"},
                     "receipt archive must contain exactly two allowlisted JSON members")
            output = {}
            for item in entries:
                mode = item.external_attr >> 16
                _require(item.orig_filename == item.filename and "\0" not in item.orig_filename
                         and stat.S_IFMT(mode) in (0, stat.S_IFREG) and not mode & 0o111
                         and not item.is_dir() and not item.flag_bits & 1
                         and item.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                         and 0 < item.file_size <= MAX_JSON, "invalid receipt archive member")
                with archive.open(item) as stream:
                    contents = stream.read(MAX_JSON + 1)
                _require(len(contents) == item.file_size, "receipt archive size mismatch")
                output[item.filename] = contents
            return output["receipt.json"], output["build.json"]
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError) as error:
        raise ValueError("unreadable receipt archive") from error


def consume_ci_receipt(expected, github):
    """Validate broker-backed provenance; return identity evidence, never admission.

    No local metadata/JSON adapter, URL fetch, candidate-derived expectation or
    latest-successful lookup is provided. The caller must independently trust
    both its ApprovedBuild selection and a real authenticated broker.
    """
    _require(type(expected) is ApprovedBuild and isinstance(github, AuthenticatedGitHubReader),
             "independent selection and authenticated service broker required")
    expected.__post_init__()
    repo, run, attempt = expected.repository_id, expected.run_id, expected.run_attempt
    _record(github.read_repository(repo), RepositoryMetadata(repo, REPOSITORY))
    _record(github.read_workflow(repo, expected.workflow_id, expected.source_commit),
            WorkflowMetadata(repo, expected.workflow_id, WORKFLOW, expected.source_commit))
    run_record = RunMetadata(repo, repo, expected.workflow_id, WORKFLOW, expected.source_commit,
                             run, attempt, "push", "main", "completed", "success")
    _record(github.read_run(repo, run), run_record)
    job = JobMetadata(run, attempt, JOB, JOB_NAME, "completed", "success")
    _record(github.read_job(repo, run, attempt, JOB), job)
    artifact = github.read_artifact(repo, expected.artifact_id)
    _require(type(artifact) is ArtifactMetadata, "authoritative artifact metadata required")
    _record(artifact, ArtifactMetadata(expected.artifact_id, repo, run, attempt,
            expected.source_commit, f"oc-qa-vm-receipt-{run}-{attempt}", False,
            artifact.size_bytes, artifact.digest))
    _require(_positive(artifact.size_bytes) and artifact.size_bytes <= MAX_ARCHIVE
             and isinstance(artifact.digest, str) and artifact.digest.startswith("sha256:")
             and _hex(artifact.digest[7:], 64), "service archive size and SHA-256 digest required")
    data = github.download_artifact(repo, expected.artifact_id, max_bytes=MAX_ARCHIVE)
    _require(type(data) is bytes and len(data) == artifact.size_bytes
             and hashlib.sha256(data).hexdigest() == artifact.digest[7:],
             "service archive digest mismatch or missing archive")
    receipt, manifest = _archive_documents(data)
    build_id = _documents(receipt, manifest, repository_id=repo,
                          source_commit=expected.source_commit, run_id=run, run_attempt=attempt)
    _record(github.read_run(repo, run), run_record)
    _record(github.read_artifact(repo, expected.artifact_id), artifact)
    _record(github.read_job(repo, run, attempt, JOB), job)
    return ValidatedCIReceipt(receipt, build_id, expected, artifact.digest[7:])


@dataclass(frozen=True)
class CIContext:
    repository_id: int
    source_commit: str
    workflow_commit: str
    run_id: int
    run_attempt: int
    repository: str
    event: str
    ref: str
    job_key: str
    workflow_ref: str

    @classmethod
    def from_environment(cls, environment):
        names = ("GITHUB_REPOSITORY_ID", "GITHUB_SHA", "GITHUB_WORKFLOW_SHA", "GITHUB_RUN_ID",
                 "GITHUB_RUN_ATTEMPT", "GITHUB_REPOSITORY", "GITHUB_EVENT_NAME", "GITHUB_REF",
                 "GITHUB_JOB", "GITHUB_WORKFLOW_REF")
        _require(all(isinstance(environment.get(key), str) and environment[key] for key in names),
                 "complete CI context required")
        values = [environment[key] for key in names]
        for index in (0, 3, 4):
            _require(re.fullmatch(r"[1-9][0-9]*", values[index]) is not None, "invalid CI numeric identity")
            values[index] = int(values[index])
        return cls(*values)


def _no_links(path):
    path = Path(os.path.abspath(path))
    _require(not any(part.is_symlink() for part in (path, *path.parents)), "linked identity input refused")
    return path


def _file_identity(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_nlink,
            value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def _read_regular(path, limit):
    path = _no_links(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        _require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                 and 0 < before.st_size <= limit, "bounded standalone regular file required")
        data = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    identity = _file_identity(before)
    _require(len(data) == before.st_size and identity == _file_identity(after)
             and identity == _file_identity(path.lstat()), "identity input changed while reading")
    return data, identity


def validate_checkout(checkout, context):
    """Producer preflight and post-build source recheck; no compilation or execution."""
    _require(type(context) is CIContext and _positive(context.repository_id)
             and _positive(context.run_id) and _positive(context.run_attempt)
             and _hex(context.source_commit, 40) and context.workflow_commit == context.source_commit
             and context.repository == REPOSITORY and context.event == "push"
             and context.ref == "refs/heads/main" and context.job_key == JOB
             and context.workflow_ref == f"{REPOSITORY}/{WORKFLOW}@refs/heads/main",
             "receipt emission requires exact-source push/main compile-sign context")
    checkout = _no_links(checkout)
    def git(*args):
        return subprocess.run(["git", "-C", str(checkout), *args], check=True,
                              capture_output=True, text=True).stdout
    _require(git("rev-parse", "--show-toplevel").strip() == str(checkout)
             and git("rev-parse", "HEAD").strip() == context.source_commit,
             "checked-out source differs from CI source")
    _require(not git("status", "--porcelain=v1", "--untracked-files=all").strip(),
             "receipt producer requires a clean tracked and untracked checkout")
    return checkout


@dataclass(frozen=True)
class ReceiptFiles:
    receipt: Path
    manifest: Path


def _write_new(path, data, *, max_bytes=MAX_JSON):
    _require(0 < len(data) <= max_bytes, "producer output size limit")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(data)


def emit_ci_receipt(bundle, *, checkout, ci_context, output_directory, sdk_version, clang_version):
    """Record post-sign bytes. This local self-check is NOT independent authentication."""
    checkout = validate_checkout(checkout, ci_context)
    bundle = _no_links(bundle)
    output = _no_links(output_directory)
    _require(output != checkout and checkout not in output.parents, "receipt directory must be outside checkout")
    _require(not output.exists(), "receipt output already exists")
    executable = bundle / EXECUTABLE
    binary, before = _read_regular(executable, 32 * 1024 * 1024)
    context = ci_context
    build_id = _build_id(context.repository_id, context.run_id, context.run_attempt)
    receipt = _canonical({"schema": 1, "repository": REPOSITORY, "source_commit": context.source_commit,
                          "build_id": build_id, "executable_sha256": hashlib.sha256(binary).hexdigest()})
    manifest = _canonical({"schema": 1, "repository": REPOSITORY, "repository_id": context.repository_id,
        "source_commit": context.source_commit, "workflow_path": WORKFLOW,
        "workflow_commit": context.workflow_commit, "run_id": context.run_id,
        "run_attempt": context.run_attempt, "job_key": JOB, "event": context.event, "ref": context.ref,
        "build_id": build_id, "bundle_id": BUNDLE_ID, "executable": EXECUTABLE,
        "architecture": "arm64", "minimum_macos": "15.0", "sdk_version": sdk_version,
        "clang_version": clang_version, "signing_mode": "ad-hoc",
        "receipt_sha256": hashlib.sha256(receipt).hexdigest()})
    _documents(receipt, manifest, repository_id=context.repository_id, source_commit=context.source_commit,
               run_id=context.run_id, run_attempt=context.run_attempt)
    output.mkdir(mode=0o700)
    paths = ReceiptFiles(output / "receipt.json", output / "build.json")
    _write_new(paths.receipt, receipt)
    verify_build_identity(bundle, build_receipt=paths.receipt, expected_source=context.source_commit)
    _require(_read_regular(executable, 32 * 1024 * 1024) == (binary, before),
             "post-sign executable changed during receipt production")
    _require(_read_regular(paths.receipt, MAX_JSON)[0] == receipt, "producer receipt changed")
    validate_checkout(checkout, context)
    _write_new(paths.manifest, manifest)
    _require({x.name for x in output.iterdir()} == {"receipt.json", "build.json"}, "unexpected receipt output")
    return paths


@dataclass(frozen=True)
class RetainedBundle:
    source_commit: str
    build_id: str
    executable_sha256: str
    archive_sha256: str


def inspect_retained_bundle(data, *, expected_source, expected_build_id):
    """Check retained byte binding without extraction, signature trust or admission."""
    _require(_hex(expected_source, 40) and _text(expected_build_id),
             "independently selected source and build ID required")
    _require(type(data) is bytes and 0 < len(data) <= MAX_BUNDLE_ARCHIVE
             and data.startswith(b"PK\x03\x04"), "invalid or oversized retained bundle")
    members = {}
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            _require(len(entries) == len(BUNDLE_MEMBERS)
                     and {item.filename for item in entries} == BUNDLE_MEMBERS.keys(),
                     "retained bundle must contain the exact signed bundle and both JSON files")
            for item in entries:
                limit, permission = BUNDLE_MEMBERS[item.filename]
                _require(item.orig_filename == item.filename and "\0" not in item.orig_filename
                         and item.create_system == 3
                         and item.external_attr >> 16 == stat.S_IFREG | permission
                         and not item.is_dir() and not item.flag_bits & 1
                         and item.compress_type == zipfile.ZIP_STORED
                         and 0 < item.file_size <= limit
                         and item.compress_size == item.file_size,
                         "invalid retained bundle member or permission")
                with archive.open(item) as stream:
                    contents = stream.read(limit + 1)
                _require(len(contents) == item.file_size, "retained bundle member size mismatch")
                members[item.filename] = contents
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError) as error:
        raise ValueError("unreadable retained bundle") from error
    manifest = _json(members["build.json"])
    _require(all(_positive(manifest.get(key)) for key in ("repository_id", "run_id", "run_attempt")),
             "retained build coordinates required")
    build_id = _documents(members["receipt.json"], members["build.json"],
        repository_id=manifest["repository_id"], source_commit=expected_source,
        run_id=manifest["run_id"], run_attempt=manifest["run_attempt"])
    _require(build_id == expected_build_id, "retained bundle differs from selected build")
    executable_sha256 = hashlib.sha256(members[f"{BUNDLE_ROOT}/{EXECUTABLE}"]).hexdigest()
    _require(executable_sha256 == _json(members["receipt.json"])["executable_sha256"],
             "retained executable differs from signed-build receipt")
    try:
        info = plistlib.loads(members[f"{BUNDLE_ROOT}/Contents/Info.plist"])
    except (plistlib.InvalidFileException, ValueError, TypeError) as error:
        raise ValueError("invalid retained bundle plist") from error
    _require(type(info) is dict and info.get("CFBundleIdentifier") == BUNDLE_ID
             and info.get("CFBundleExecutable") == EXECUTABLE.rsplit("/", 1)[1],
             "retained bundle identity mismatch")
    return RetainedBundle(expected_source, build_id, executable_sha256,
                          hashlib.sha256(data).hexdigest())


def retain_ci_bundle(bundle, *, receipt_directory, output_file, expected_source, expected_build_id):
    """Retain the signature-checked producer bundle; never rebuild or execute it."""
    bundle = _no_links(bundle)
    receipts = _no_links(receipt_directory)
    output = _no_links(output_file)
    _require(bundle.name == BUNDLE_ROOT and output != bundle and bundle not in output.parents
             and output != receipts and receipts not in output.parents,
             "standalone bundle and separate retained output required")
    verify_build_identity(bundle, build_receipt=receipts / "receipt.json", expected_source=expected_source)
    inputs = {}
    for name, (limit, _) in BUNDLE_MEMBERS.items():
        path = receipts / name if name in ("receipt.json", "build.json") else bundle / name.split("/", 1)[1]
        inputs[name] = (path, *_read_regular(path, limit))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, (_, contents, _) in inputs.items():
            item = zipfile.ZipInfo(name)
            item.create_system = 3
            item.external_attr = (stat.S_IFREG | BUNDLE_MEMBERS[name][1]) << 16
            archive.writestr(item, contents)
    data = buffer.getvalue()
    result = inspect_retained_bundle(data, expected_source=expected_source,
                                     expected_build_id=expected_build_id)
    verify_build_identity(bundle, build_receipt=receipts / "receipt.json", expected_source=expected_source)
    for name, (path, contents, identity) in inputs.items():
        _require(_read_regular(path, BUNDLE_MEMBERS[name][0]) == (contents, identity),
                 "signed bundle or receipt changed during retention")
    _write_new(output, data, max_bytes=MAX_BUNDLE_ARCHIVE)
    _require(_read_regular(output, MAX_BUNDLE_ARCHIVE)[0] == data,
             "retained archive changed during output readback")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    preflight = commands.add_parser("preflight")
    preflight.add_argument("--checkout", type=Path, required=True)
    emit = commands.add_parser("emit")
    emit.add_argument("--checkout", type=Path, required=True)
    emit.add_argument("--bundle", type=Path, required=True)
    emit.add_argument("--output-directory", type=Path, required=True)
    emit.add_argument("--sdk-version", required=True)
    emit.add_argument("--clang-version", required=True)
    retain = commands.add_parser("retain")
    retain.add_argument("--checkout", type=Path, required=True)
    retain.add_argument("--bundle", type=Path, required=True)
    retain.add_argument("--receipt-directory", type=Path, required=True)
    retain.add_argument("--output-file", type=Path, required=True)
    args = parser.parse_args()
    try:
        context = CIContext.from_environment(os.environ)
        if args.command == "preflight":
            validate_checkout(args.checkout, context)
            print("PASS: producer context/source preflight only; not authenticated evidence")
        elif args.command == "emit":
            emit_ci_receipt(args.bundle, checkout=args.checkout, ci_context=context,
                output_directory=args.output_directory, sdk_version=args.sdk_version,
                clang_version=args.clang_version)
            print("PASS: two inert JSON files emitted; authentication and native admission NOT established")
        else:
            checkout = validate_checkout(args.checkout, context)
            output = _no_links(args.output_file)
            _require(output != checkout and checkout not in output.parents,
                     "retained archive must be outside checkout")
            result = retain_ci_bundle(args.bundle, receipt_directory=args.receipt_directory,
                output_file=output, expected_source=context.source_commit,
                expected_build_id=_build_id(context.repository_id, context.run_id, context.run_attempt))
            validate_checkout(checkout, context)
            print(f"PASS: retained signed-build bytes {result.executable_sha256}; authentication and native admission NOT established")
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"REFUSED: {error}\n")


if __name__ == "__main__":
    main()
