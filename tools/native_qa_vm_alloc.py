"""Authenticated guest resource allocation for QA VM confinement.

Produces a frozen GuestAllocation record describing the disposable disk image
and auxiliary storage files, bound to a StagedBundle identity.

No VZ runtime is used. No file is opened for execution. The record captures
exact filesystem identity (device, inode, size, mtime_ns, ctime_ns) at
allocation time — the identity-through-use contract: identities are locked at
produce_guest_allocation(), carried through DispatchPlan, and rechecked by the
executor immediately before any native subprocess call.

This does NOT close the TOCTOU window between recheck and execve; that requires
O_PATH-pinned fds or similar native admission that remains E1's responsibility.

Cloud-safe: produce_guest_allocation() and recheck_resource_identity() stat
files and open O_RDONLY|O_NOFOLLOW|O_NONBLOCK for identity capture only.
No subprocess, no network, no native execution.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import stat
from typing import Optional

from tools import native_qa_vm_staging as staging

# ---------------------------------------------------------------------------
# Size limits for guest resource files.

# 16 GiB — smallest plausible macOS installer base image.
MAX_DISK_BYTES: int = 16 * 1024 * 1024 * 1024
# 128 MiB — VZ NVRAM auxiliary storage is typically under 1 MiB; 128 MiB is generous.
MAX_AUX_BYTES: int = 128 * 1024 * 1024
# 1 byte minimum — zero-size files are not plausible guest resources.
MIN_RESOURCE_BYTES: int = 1

# ---------------------------------------------------------------------------
# CLI argument names the runner will receive.
ARG_DISK = "--disk"
ARG_AUX = "--aux"


# ---------------------------------------------------------------------------
# Public types.

@dataclass(frozen=True)
class GuestResourceIdentity:
    """Captured filesystem identity of one guest resource file at allocation time.

    Fields correspond to os.fstat() observations taken while the file was open
    via O_RDONLY|O_NOFOLLOW|O_NONBLOCK, preventing symlink substitution.

    No content hash is stored: resource files may be many GiB and content
    hashing would block the caller for an unacceptable duration.  The executor
    must call recheck_resource_identity() immediately before native invocation.
    """
    path: str       # absolute POSIX path with no symlinks in ancestry at capture time
    dev: int        # st_dev
    ino: int        # st_ino
    size: int       # st_size in bytes
    mtime_ns: int   # st_mtime_ns
    ctime_ns: int   # st_ctime_ns
    nlink: int      # must be 1 (no hard links)
    mode: int       # S_IMODE (permission bits only)


@dataclass(frozen=True)
class GuestAllocation:
    """Frozen allocation record binding guest resources to a staged bundle identity.

    Fields
    ------
    source_commit   : 40-hex source identity from the StagedBundle.
    build_id        : build identity string from the StagedBundle.
    disk            : captured identity of the disposable disk image file.
    aux             : captured identity of the auxiliary storage file.

    This record does not grant execution authority.  E1 must still satisfy all
    native admission requirements and must call recheck_resource_identity() on
    both disk and aux before any native invocation.
    """
    source_commit: str
    build_id: str
    disk: GuestResourceIdentity
    aux: GuestResourceIdentity

    def __post_init__(self) -> None:
        if not (isinstance(self.source_commit, str) and len(self.source_commit) == 40
                and all(c in "0123456789abcdef" for c in self.source_commit)):
            raise ValueError("source_commit must be a 40-hex string")
        if not (isinstance(self.build_id, str) and self.build_id):
            raise ValueError("build_id must be a non-empty string")
        if not isinstance(self.disk, GuestResourceIdentity):
            raise TypeError("disk must be a GuestResourceIdentity")
        if not isinstance(self.aux, GuestResourceIdentity):
            raise TypeError("aux must be a GuestResourceIdentity")
        # disk and aux must be distinct files.
        if self.disk.dev == self.aux.dev and self.disk.ino == self.aux.ino:
            raise ValueError("disk image and auxiliary storage must be distinct files")


# ---------------------------------------------------------------------------
# Private helpers.

def _capture_resource_identity(
    path: Path,
    *,
    min_bytes: int,
    max_bytes: int,
) -> GuestResourceIdentity:
    """Stat a guest resource file and return its captured identity.

    Opens the file O_RDONLY|O_NOFOLLOW|O_NONBLOCK to get an fstat() on the
    actual inode without following a symlink substitution.

    Raises ValueError for absent, non-owned, linked, symlinked, or out-of-range
    files.  Raises OSError for unexpected OS failures.
    """
    abs_path = Path(os.path.abspath(path))
    # Reject symlinks at the final path component (O_NOFOLLOW also enforces this
    # at open time).  Ancestor components are allowed to be symlinks, matching
    # the pattern used throughout this module family.
    try:
        linfo = abs_path.lstat()
    except OSError as exc:
        raise ValueError(
            f"cannot stat guest resource file: {path}: {exc}"
        ) from exc
    if stat.S_ISLNK(linfo.st_mode):
        raise ValueError(f"guest resource must not be a symlink: {path}")
    try:
        fd = os.open(
            abs_path,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        )
    except OSError as exc:
        raise ValueError(
            f"cannot open guest resource file: {path}: {exc}"
        ) from exc
    try:
        st = os.fstat(fd)
    finally:
        os.close(fd)
    if not stat.S_ISREG(st.st_mode):
        raise ValueError(f"guest resource must be a regular file: {path}")
    if st.st_nlink != 1:
        raise ValueError(
            f"guest resource must have exactly one hard link: {path}"
        )
    if st.st_uid != os.geteuid():
        raise ValueError(
            f"guest resource must be owned by the current user: {path}"
        )
    if not (min_bytes <= st.st_size <= max_bytes):
        raise ValueError(
            f"guest resource size {st.st_size} not in "
            f"[{min_bytes}, {max_bytes}]: {path}"
        )
    return GuestResourceIdentity(
        path=str(abs_path),
        dev=st.st_dev,
        ino=st.st_ino,
        size=st.st_size,
        mtime_ns=st.st_mtime_ns,
        ctime_ns=st.st_ctime_ns,
        nlink=st.st_nlink,
        mode=stat.S_IMODE(st.st_mode),
    )


# ---------------------------------------------------------------------------
# Public functions.

def produce_guest_allocation(
    bundle: staging.StagedBundle,
    disk_image: Path,
    aux_storage: Path,
    *,
    max_disk_bytes: int = MAX_DISK_BYTES,
    max_aux_bytes: int = MAX_AUX_BYTES,
) -> GuestAllocation:
    """Validate guest resources and produce a frozen allocation bound to bundle identity.

    Both resource files must be regular, owned by the current user, free of
    symlinks in their ancestry, free of hard links, and within the specified
    size bounds.  They must be distinct files (different inodes or devices).

    The returned GuestAllocation carries the bundle's source_commit and
    build_id so the executor can verify identity binding before invocation.

    Raises TypeError for wrong argument types.
    Raises ValueError for absent, non-owned, linked, symlinked, same-file,
        or out-of-range resources, or mismatched bundle identity.
    """
    if not isinstance(bundle, staging.StagedBundle):
        raise TypeError("bundle must be a StagedBundle")
    if not isinstance(max_disk_bytes, int) or max_disk_bytes < MIN_RESOURCE_BYTES:
        raise ValueError(
            f"max_disk_bytes must be an integer >= {MIN_RESOURCE_BYTES}"
        )
    if not isinstance(max_aux_bytes, int) or max_aux_bytes < MIN_RESOURCE_BYTES:
        raise ValueError(
            f"max_aux_bytes must be an integer >= {MIN_RESOURCE_BYTES}"
        )
    disk_id = _capture_resource_identity(
        Path(disk_image),
        min_bytes=MIN_RESOURCE_BYTES,
        max_bytes=max_disk_bytes,
    )
    aux_id = _capture_resource_identity(
        Path(aux_storage),
        min_bytes=MIN_RESOURCE_BYTES,
        max_bytes=max_aux_bytes,
    )
    return GuestAllocation(
        source_commit=bundle.source_commit,
        build_id=bundle.build_id,
        disk=disk_id,
        aux=aux_id,
    )


def recheck_resource_identity(identity: GuestResourceIdentity) -> None:
    """Recheck a captured identity; raises ValueError if the file changed.

    Called by the executor immediately before any native invocation.  Detects
    path modification, truncation, timestamp changes, and inode reuse.

    This check is NOT atomic with execve; true race prevention requires
    O_PATH-pinned file descriptors and is E1's native responsibility.

    Raises TypeError for wrong argument type.
    Raises ValueError if the file changed, disappeared, or grew a symlink.
    Raises OSError for unexpected OS failures.
    """
    if not isinstance(identity, GuestResourceIdentity):
        raise TypeError("identity must be a GuestResourceIdentity")
    path = Path(identity.path)
    # Re-check that the final path component is not a symlink.
    try:
        linfo = path.lstat()
    except OSError as exc:
        raise ValueError(
            f"guest resource file disappeared since allocation: {path}: {exc}"
        ) from exc
    if stat.S_ISLNK(linfo.st_mode):
        raise ValueError(
            f"guest resource path grew a symlink since allocation: {path}"
        )
    try:
        fd = os.open(
            path,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        )
    except OSError as exc:
        raise ValueError(
            f"guest resource file disappeared since allocation: {path}: {exc}"
        ) from exc
    try:
        st = os.fstat(fd)
    finally:
        os.close(fd)

    if not (
        stat.S_ISREG(st.st_mode)
        and st.st_dev == identity.dev
        and st.st_ino == identity.ino
        and st.st_size == identity.size
        and st.st_mtime_ns == identity.mtime_ns
        and st.st_ctime_ns == identity.ctime_ns
        and st.st_nlink == identity.nlink
        and stat.S_IMODE(st.st_mode) == identity.mode
    ):
        raise ValueError(
            f"guest resource identity changed since allocation: {path}"
        )


def build_allocation_argv(allocation: GuestAllocation) -> tuple[str, ...]:
    """Return the allocation CLI arguments the runner should receive.

    Returns a 4-tuple ``(ARG_DISK, disk_path, ARG_AUX, aux_path)``.
    This tuple is appended to the runner executable path in the DispatchPlan
    argv; the executable itself is prepended by compose_invocation().

    Raises TypeError for wrong argument type.
    """
    if not isinstance(allocation, GuestAllocation):
        raise TypeError("allocation must be a GuestAllocation")
    return (ARG_DISK, allocation.disk.path, ARG_AUX, allocation.aux.path)
