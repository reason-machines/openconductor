"""VZ disk+aux consumer bridge for the native QA VM.

Defines the source-level configuration model for the Virtualization.framework
(VZ) Mac VM that the native QA VM runner eventually runs in.  Provides
``compose_vz_configuration`` which constructs a ``VZMacConfiguration`` from an
authenticated ``StagedBundle`` and caller-supplied disk/aux paths.

Design boundary
---------------
* No Virtualization.framework import, no subprocess, no native framework
  call, no OS admission.  VZ framework types are mirrored as plain Python
  dataclasses: the actual ``VZMacOSVirtualMachineStartOptions``,
  ``VZDiskImageStorageDeviceAttachment``, and ``VZMacAuxiliaryStorage`` calls
  happen in the native-qa-vm-runner Objective-C/Swift binary on E1 only.
* All byte/count limits reflect Apple's documented minimums for a macOS 15
  guest at minimum viable configuration.
* ``compose_vz_configuration`` is cloud-safe and may be called from any
  portable test; it performs no filesystem operations.

VZ resource model
-----------------
A macOS VM needs three resources:

  disk image    — the main read-write system image (APFS container).
                  For the QA runner this is an ephemeral, disposable image.
  aux storage   — VZMacAuxiliaryStorage; holds NVRAM/EFI state.
                  Separate from the disk; must exist before the VM starts.
  hardware model— VZMacHardwareModel, encodes the guest hardware identity;
                  not managed here (produced by the restore image pipeline).

The bridge binds the authenticated StagedBundle identity to the VZ
configuration, ensuring the VM parameters are traceable to the same build
receipt that the allocation producer validated.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from tools import native_qa_vm_staging as staging

# ---------------------------------------------------------------------------
# VM resource limits (minimum viable macOS 15 guest).

MIN_MEMORY_BYTES: int = 4 * 1024 * 1024 * 1024    # 4 GiB
MAX_MEMORY_BYTES: int = 64 * 1024 * 1024 * 1024   # 64 GiB
MIN_CPU_COUNT: int = 1
MAX_CPU_COUNT: int = 16
DEFAULT_MEMORY_BYTES: int = 8 * 1024 * 1024 * 1024  # 8 GiB
DEFAULT_CPU_COUNT: int = 2

# Maximum path lengths (POSIX MAXPATHLEN).
_MAX_PATH_LEN: int = 1024


# ---------------------------------------------------------------------------
# Exceptions.


class VZConfigurationRefusal(ValueError):
    """Parameters do not satisfy the VZ configuration contract."""


# ---------------------------------------------------------------------------
# Data model.


@dataclass(frozen=True)
class VZDiskImageAttachment:
    """Source model for VZDiskImageStorageDeviceAttachment.

    Fields
    ------
    path      : absolute path to the disk image file.
    read_only : True for a restore/reference image; False for a writable image.
                The QA VM uses read_only=False (ephemeral, disposable disk).
    """
    path: Path
    read_only: bool


@dataclass(frozen=True)
class VZMacAuxiliaryStorageSpec:
    """Source model for VZMacAuxiliaryStorage.

    Fields
    ------
    path : absolute path to the auxiliary storage file.
           Must not be the same path as the disk image.
    """
    path: Path


@dataclass(frozen=True)
class VZMacConfiguration:
    """Source model for the full VZ Mac VM configuration.

    Fields
    ------
    source_commit       : 40-hex source identity from the staged bundle.
    build_id            : build identity from the staged bundle.
    executable_sha256   : SHA-256 of the staged executable (config binding).
    disk                : VZDiskImageAttachment for the main system disk.
    aux                 : VZMacAuxiliaryStorageSpec for NVRAM/EFI state.
    cpu_count           : vCPU count in [MIN_CPU_COUNT, MAX_CPU_COUNT].
    memory_bytes        : guest memory size in [MIN_MEMORY_BYTES, MAX_MEMORY_BYTES].

    This configuration token does not constitute execution authority.  E1 must
    still satisfy all native admission requirements before starting the VM.
    """
    source_commit: str
    build_id: str
    executable_sha256: str
    disk: VZDiskImageAttachment
    aux: VZMacAuxiliaryStorageSpec
    cpu_count: int
    memory_bytes: int


# ---------------------------------------------------------------------------
# Configuration composer.


def compose_vz_configuration(
    bundle: staging.StagedBundle,
    disk_path: Path,
    aux_path: Path,
    *,
    cpu_count: int = DEFAULT_CPU_COUNT,
    memory_bytes: int = DEFAULT_MEMORY_BYTES,
    disk_read_only: bool = False,
) -> VZMacConfiguration:
    """Construct a VZMacConfiguration from an authenticated bundle and paths.

    Validates:
    1. *bundle* is a StagedBundle with well-formed identity fields.
    2. *disk_path* and *aux_path* are absolute Paths that differ from each other.
    3. *cpu_count* is in [MIN_CPU_COUNT, MAX_CPU_COUNT].
    4. *memory_bytes* is in [MIN_MEMORY_BYTES, MAX_MEMORY_BYTES] and a multiple
       of 1 MiB (Virtualization.framework alignment requirement).

    This function performs no filesystem I/O and does not check that the paths
    exist; path existence is verified by the native QA runner at VM start time.

    Parameters
    ----------
    bundle         : authenticated staged bundle (from stage_retained_bundle).
    disk_path      : absolute path for the main disk image attachment.
    aux_path       : absolute path for the auxiliary storage file.
    cpu_count      : number of vCPUs; defaults to DEFAULT_CPU_COUNT.
    memory_bytes   : guest memory in bytes; defaults to DEFAULT_MEMORY_BYTES.
    disk_read_only : whether the disk attachment is read-only; defaults False.

    Raises
    ------
    TypeError
        If *bundle* is not a StagedBundle, or *disk_path*/*aux_path* are not
        Path instances.
    VZConfigurationRefusal
        If any parameter is out of bounds or the paths collide.
    """
    if not isinstance(bundle, staging.StagedBundle):
        raise TypeError("bundle must be a StagedBundle")
    if not isinstance(disk_path, Path):
        raise TypeError("disk_path must be a pathlib.Path")
    if not isinstance(aux_path, Path):
        raise TypeError("aux_path must be a pathlib.Path")

    # Path absolute checks.
    if not disk_path.is_absolute():
        raise VZConfigurationRefusal("disk_path must be absolute")
    if not aux_path.is_absolute():
        raise VZConfigurationRefusal("aux_path must be absolute")

    # Path length checks.
    if len(str(disk_path)) > _MAX_PATH_LEN:
        raise VZConfigurationRefusal(
            f"disk_path exceeds maximum path length ({_MAX_PATH_LEN})"
        )
    if len(str(aux_path)) > _MAX_PATH_LEN:
        raise VZConfigurationRefusal(
            f"aux_path exceeds maximum path length ({_MAX_PATH_LEN})"
        )

    # Disk and aux must be distinct.
    if disk_path == aux_path:
        raise VZConfigurationRefusal(
            "disk_path and aux_path must be different paths"
        )

    # CPU count bounds.
    if not (isinstance(cpu_count, int) and MIN_CPU_COUNT <= cpu_count <= MAX_CPU_COUNT):
        raise VZConfigurationRefusal(
            f"cpu_count must be an integer in [{MIN_CPU_COUNT}, {MAX_CPU_COUNT}], "
            f"got {cpu_count!r}"
        )

    # Memory bounds and alignment.
    _MIB = 1024 * 1024
    if not (
        isinstance(memory_bytes, int)
        and MIN_MEMORY_BYTES <= memory_bytes <= MAX_MEMORY_BYTES
        and memory_bytes % _MIB == 0
    ):
        raise VZConfigurationRefusal(
            f"memory_bytes must be an integer multiple of 1 MiB in "
            f"[{MIN_MEMORY_BYTES}, {MAX_MEMORY_BYTES}], got {memory_bytes!r}"
        )

    # Bundle identity validation.
    if not (isinstance(bundle.source_commit, str) and len(bundle.source_commit) == 40):
        raise VZConfigurationRefusal(
            "bundle.source_commit must be a 40-character hex string"
        )
    if not (isinstance(bundle.build_id, str) and bundle.build_id):
        raise VZConfigurationRefusal("bundle.build_id must be a non-empty string")
    if not (isinstance(bundle.executable_sha256, str) and len(bundle.executable_sha256) == 64):
        raise VZConfigurationRefusal(
            "bundle.executable_sha256 must be a 64-character hex string"
        )

    return VZMacConfiguration(
        source_commit=bundle.source_commit,
        build_id=bundle.build_id,
        executable_sha256=bundle.executable_sha256,
        disk=VZDiskImageAttachment(path=disk_path, read_only=disk_read_only),
        aux=VZMacAuxiliaryStorageSpec(path=aux_path),
        cpu_count=cpu_count,
        memory_bytes=memory_bytes,
    )
