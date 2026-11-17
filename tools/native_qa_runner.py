"""Fail-closed macOS process-family transport, not whole-app admission."""
from dataclasses import dataclass
from enum import Enum
import hashlib
import math
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys

POLICY_VERSION = "OPENCONDUCTOR_NATIVE_QA_CONFINEMENT_V1"
SANDBOX_EXEC = Path("/usr/bin/sandbox-exec")
DATA_DIRECTORIES = ("home", "settings", "config", "cache", "data", "tmp", "e2e", "app-data")
MUTABLE_FILES = {"QA_STATE": "data/confinement-state", "QA_STARTUP": "tmp/confinement-startup",
                 "QA_CHILD": "tmp/confinement-child"}
POLICY = '''(version 1)
(deny default)
(allow process-fork)
(allow process-exec (literal (param "QA_EXECUTABLE")))
(allow file-read-data file-read-metadata (literal "/"))
(allow file-read* (subpath (param "QA_ROOT"))
    (subpath "/System/Library") (subpath "/usr/lib")
    (subpath "/Library/Apple/System/Library"))
(allow file-map-executable (literal (param "QA_EXECUTABLE"))
    (subpath "/System/Library") (subpath "/usr/lib")
    (subpath "/Library/Apple/System/Library"))
'''+"\n".join(f'(allow file-write-data (literal (param "{name}")))'
             for name in MUTABLE_FILES)+"\n"
POLICY_SHA256 = hashlib.sha256(POLICY.encode()).hexdigest()


class Probe(Enum):
    PATHS = (("--oc-qa-paths",), 30)
    WEBKIT = (("--oc-qa-webkit",), 15)
    ORDINARY = ((), 15)
    STORAGE_WRITE = (("--oc-qa-storage-write",), 16)
    STORAGE_READ = (("--oc-qa-storage-read",), 16)

    @property
    def arguments(self):
        return self.value[0]

    @property
    def timeout_seconds(self):
        return self.value[1]


@dataclass(frozen=True)
class LaunchSpec:
    root: Path
    executable: Path
    probe: Probe
    token: str | None = None
    timeout_seconds: float | None = None


@dataclass(frozen=True)
class CompletedProbe:
    pid: int
    returncode: int
    stdout: str
    stderr: str
    policy_version: str = POLICY_VERSION
    policy_sha256: str = POLICY_SHA256
    policy_parameters: tuple[tuple[str, str], ...] = ()

    @property
    def policy_receipt(self):
        return {"version": self.policy_version, "sha256": self.policy_sha256,
                "parameters": dict(self.policy_parameters),
                "scope": "requested host process-family policy; not whole-app/helper admission"}


def _staged_info(path, *, directory=False):
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode):
        raise ValueError("QA staging must not contain symlink aliases")
    expected_type = stat.S_ISDIR if directory else stat.S_ISREG
    if info.st_uid != os.geteuid() or not expected_type(info.st_mode):
        raise ValueError("QA staging contains an unowned or unsupported filesystem object")
    if not directory and info.st_nlink != 1:
        raise ValueError("QA staging must not contain hard-link aliases")
    return info


def _validate_parents(root, path):
    for parent in reversed(path.relative_to(root).parents):
        _staged_info(root / parent, directory=True)


def _raise_walk_error(error):
    raise error


def _validate(spec):
    root = Path(spec.root)
    executable = Path(spec.executable)
    if not root.is_absolute() or root != root.resolve(strict=True):
        raise ValueError("QA root must be canonical without symlinks")
    info = _staged_info(root, directory=True)
    if stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("QA root must be an owned directory with mode 0700")
    if (not executable.is_absolute() or executable != executable.resolve(strict=True)
            or not executable.is_relative_to(root) or executable == root):
        raise ValueError("QA executable must be canonical and staged inside the QA root")
    _validate_parents(root, executable)
    info = _staged_info(executable)
    if not info.st_mode & stat.S_IXUSR:
        raise ValueError("QA executable must be an owned executable file")
    if any(executable.is_relative_to(root / name) for name in DATA_DIRECTORIES):
        raise ValueError("QA executable must not be staged in a mutable data directory")
    for relative in MUTABLE_FILES.values():
        path = root / relative
        _validate_parents(root, path)
        info = _staged_info(path)
        if stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError("mutable QA files must be regular files with mode 0600")
    for directory, directories, files in os.walk(root, followlinks=False, onerror=_raise_walk_error):
        _staged_info(Path(directory), directory=True)
        for name in directories:
            _staged_info(Path(directory) / name, directory=True)
        for name in files:
            _staged_info(Path(directory) / name)
    if not isinstance(spec.probe, Probe):
        raise ValueError("unsupported QA probe")
    storage = spec.probe in (Probe.STORAGE_WRITE, Probe.STORAGE_READ)
    if ((storage and (not isinstance(spec.token, str) or re.fullmatch(r"[0-9a-f]{32}", spec.token) is None))
            or (not storage and spec.token is not None)):
        raise ValueError("storage probes require exactly one 32-character fixture token")
    timeout = spec.probe.timeout_seconds if spec.timeout_seconds is None else spec.timeout_seconds
    if (type(timeout) not in (int, float) or not math.isfinite(timeout)
            or not 0 < timeout <= spec.probe.timeout_seconds):
        raise ValueError("QA probe timeout exceeds its bounded contract")
    return timeout


def _policy_parameters(spec):
    return {"QA_ROOT": str(spec.root), "QA_EXECUTABLE": str(spec.executable),
            **{key: str(spec.root / relative) for key, relative in MUTABLE_FILES.items()}}


def _sandbox_command(spec):
    if sys.platform != "darwin":
        raise ValueError("native QA confinement is supported on macOS only; no unconfined fallback")
    if not SANDBOX_EXEC.is_file() or not os.access(SANDBOX_EXEC, os.X_OK):
        raise ValueError("native QA sandbox enforcement backend is unavailable")
    command = [str(SANDBOX_EXEC)]
    for key, value in _policy_parameters(spec).items():
        command.extend(["-D", f"{key}={value}"])
    return [*command, "-p", POLICY, str(spec.executable), *spec.probe.arguments]


def run_probe(spec):
    """Run one fixed probe with no caller-supplied environment or subprocess knobs."""
    timeout = _validate(spec)
    command = _sandbox_command(spec)
    if __package__:
        from .native_qa import environment
    else:
        from native_qa import environment
    env = environment(spec.root)
    if spec.token is not None:
        env["OC_NATIVE_QA_STORAGE_TOKEN"] = spec.token
    process = subprocess.Popen(command, env=env, cwd=spec.root, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                               close_fds=True, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
        return CompletedProbe(process.pid, process.returncode, stdout, stderr,
                              policy_parameters=tuple(_policy_parameters(spec).items()))
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        process.stdout.close()
        process.stderr.close()
