"""Extract a retained bundle to an owned staging directory. No execution or launch."""
import hashlib
import io
import os
from dataclasses import dataclass
from pathlib import Path
import shutil
import stat
import zipfile

from tools import native_qa_vm_receipt as policy

# Members of the bundle archive that belong outside the app bundle directory.
_RECEIPT_MEMBERS = frozenset(("receipt.json", "build.json"))
# Bundle root directory name inside the archive.
_BUNDLE_ROOT = policy.BUNDLE_ROOT
# Archive-relative path of the executable.
_EXECUTABLE_MEMBER = f"{_BUNDLE_ROOT}/{policy.EXECUTABLE}"


@dataclass(frozen=True)
class StagedBundle:
    """Authenticated bundle extracted to an owned staging directory.

    The staged_path is a mode-0700 directory owned by the current user.
    It contains only the app bundle directory (not the receipt files).
    The executable is at app_path / executable_subpath with mode 0755.
    source_commit and build_id come from the RetainedBundle that was staged;
    executable_sha256 is rechecked after extraction.

    This token does not grant execution authority. The caller must still
    satisfy any further admission requirements before running the executable.
    """

    source_commit: str
    build_id: str
    executable_sha256: str
    staged_path: Path
    app_path: Path
    executable_path: Path


def _write_member(dest: Path, data: bytes, mode: int) -> None:
    """Write data to dest with exclusive creation; set mode afterwards."""
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
    except BaseException:
        try:
            os.unlink(dest)
        except OSError:
            pass
        raise
    os.chmod(dest, mode)


def _lstat_owned_regular(path: Path, expected_mode: int) -> os.stat_result:
    """Lstat path and verify it is an owned regular file with no symlink, hardlink or setuid."""
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode):
        raise ValueError(f"staged path must not be a symlink: {path}")
    if not stat.S_ISREG(info.st_mode):
        raise ValueError(f"staged path must be a regular file: {path}")
    if info.st_nlink != 1:
        raise ValueError(f"staged file must have exactly one hard link: {path}")
    if info.st_uid != os.geteuid():
        raise ValueError(f"staged file must be owned by the current user: {path}")
    actual_mode = stat.S_IMODE(info.st_mode)
    if actual_mode != expected_mode:
        raise ValueError(
            f"staged file has mode {oct(actual_mode)}, expected {oct(expected_mode)}: {path}"
        )
    return info


def _lstat_owned_dir(path: Path) -> os.stat_result:
    """Lstat path and verify it is an owned non-symlink directory."""
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode):
        raise ValueError(f"staged directory must not be a symlink: {path}")
    if not stat.S_ISDIR(info.st_mode):
        raise ValueError(f"staged path must be a directory: {path}")
    if info.st_uid != os.geteuid():
        raise ValueError(f"staged directory must be owned by the current user: {path}")
    return info


def stage_retained_bundle(data: bytes, target: Path) -> StagedBundle:
    """Extract a retained bundle archive to target and return an authenticated token.

    target must not exist. It is created as a mode-0700 owned directory.
    On any error after creation, the partial target is removed before raising.

    data is validated by inspect_retained_bundle before any extraction.
    The extracted executable's sha256 is rechecked after writing.
    receipt.json and build.json are not extracted into target.

    Raises ValueError for any integrity or layout violation.
    Raises OSError for filesystem errors.
    """
    target = Path(os.path.abspath(target))
    # Reject symlinks in the target path's ancestry.
    if any(parent.is_symlink() for parent in (target, *target.parents)):
        raise ValueError("staging target must not traverse symlinks")
    if target.exists() or target.is_symlink():
        raise ValueError(f"staging target already exists: {target}")

    # Validate the archive before touching the filesystem.
    # We need expected_source and expected_build_id; extract them from the archive first.
    policy._require(
        type(data) is bytes and 0 < len(data) <= policy.MAX_BUNDLE_ARCHIVE
        and data.startswith(b"PK\x03\x04"),
        "retained bundle data must be a valid non-empty zip archive within size limit",
    )
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            receipt_bytes = archive.read("receipt.json")
            build_bytes = archive.read("build.json")
    except (KeyError, zipfile.BadZipFile, RuntimeError) as error:
        raise ValueError("cannot read receipt from retained bundle") from error

    receipt = policy._json(receipt_bytes)
    build = policy._json(build_bytes)
    policy._require(
        isinstance(receipt, dict) and isinstance(build, dict),
        "receipt and build documents must be JSON objects",
    )
    expected_source = receipt.get("source_commit", "")
    expected_build_id = receipt.get("build_id", "")
    policy._require(
        policy._hex(expected_source, 40) and policy._text(expected_build_id),
        "receipt must supply a 40-hex source_commit and non-empty build_id",
    )

    # Full validation via the existing contract.
    retained = policy.inspect_retained_bundle(
        data, expected_source=expected_source, expected_build_id=expected_build_id
    )

    # Build the member map we will extract (bundle members only, not receipts).
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members = {item.filename: archive.read(item.filename) for item in archive.infolist()}
    except (zipfile.BadZipFile, RuntimeError, KeyError) as error:
        raise ValueError("cannot read members from retained bundle") from error

    bundle_members = {
        name: (content, policy.BUNDLE_MEMBERS[name][1])
        for name, content in members.items()
        if name not in _RECEIPT_MEMBERS and name in policy.BUNDLE_MEMBERS
    }
    if not bundle_members:
        raise ValueError("retained bundle contains no extractable app bundle members")

    # Determine directory structure needed.
    dirs_needed: set[str] = set()
    for name in bundle_members:
        for parent in Path(name).parents:
            if str(parent) != ".":
                dirs_needed.add(str(parent))
    dirs_needed = sorted(dirs_needed, key=lambda p: p.count("/"))

    # Extract.
    target.mkdir(mode=0o700)
    try:
        for dir_rel in dirs_needed:
            dir_path = target / dir_rel
            dir_path.mkdir(mode=0o755, exist_ok=False)
            _lstat_owned_dir(dir_path)

        for name, (content, mode) in bundle_members.items():
            dest = target / name
            _write_member(dest, content, mode)
            _lstat_owned_regular(dest, mode)

        # Recheck executable digest after extraction.
        executable_path = target / _EXECUTABLE_MEMBER
        if not executable_path.is_file():
            raise ValueError(f"executable not found after extraction: {executable_path}")
        actual_digest = hashlib.sha256(executable_path.read_bytes()).hexdigest()
        if actual_digest != retained.executable_sha256:
            raise ValueError(
                f"extracted executable digest {actual_digest} does not match "
                f"receipt {retained.executable_sha256}"
            )

        app_path = target / _BUNDLE_ROOT
        _lstat_owned_dir(app_path)

        return StagedBundle(
            source_commit=retained.source_commit,
            build_id=retained.build_id,
            executable_sha256=retained.executable_sha256,
            staged_path=target,
            app_path=app_path,
            executable_path=executable_path,
        )
    except BaseException:
        try:
            shutil.rmtree(target, ignore_errors=True)
        except OSError:
            pass
        raise


def compose_invocation(bundle: StagedBundle) -> tuple[str, ...]:
    """Return the fixed argv for the authenticated VM runner; never executes it.

    The caller is responsible for any further admission, net-fd supply and
    lifecycle management. This function only encodes the authenticated path
    and the fixed single-instance flag.

    Returns a tuple so the caller can inspect or hash it without shell
    interpretation. The executable is the first element.
    """
    if not isinstance(bundle, StagedBundle):
        raise TypeError("bundle must be a StagedBundle")
    exe = bundle.executable_path
    if not exe.is_absolute():
        raise ValueError("StagedBundle.executable_path must be absolute")
    return (str(exe),)
