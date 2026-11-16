/*
 * ResourceValidator.h — C-level identity validation for VM disk/aux resources.
 *
 * Opens the resource file O_RDONLY|O_NOFOLLOW|O_NONBLOCK and validates its
 * identity through fstat before the VZ framework boundary.  Pure POSIX C;
 * no Virtualization framework dependency.
 */

#pragma once

/*
 * OCVMResourceKind — the role of the resource file.
 *
 * OC_VM_RES_DISK resources must also pass W_OK (the VZ block attachment opens
 * them read-write).  OC_VM_RES_AUX resources are read-only to VZ and do not
 * require a write-access check.
 */
typedef enum {
    OC_VM_RES_DISK = 0, /* disk image:    S_ISREG, nlink==1, uid==geteuid, size∈[1,256GiB], W_OK */
    OC_VM_RES_AUX  = 1, /* aux storage:   S_ISREG, nlink==1, uid==geteuid, size∈[1,4GiB]        */
} OCVMResourceKind;

/*
 * OCVMValidateResource — open and identity-validate a resource file.
 *
 * Opens path with O_RDONLY|O_NOFOLLOW|O_NONBLOCK, then fstat-validates:
 *   S_ISREG        — regular file only; directories, symlinks and devices are rejected
 *   st.st_nlink==1 — no hard-link aliasing
 *   st.st_uid==geteuid() — file is owned by the calling process
 *   st.st_size in [1 byte, max] where max is 256 GiB for disk and 4 GiB for aux
 *   access(path, W_OK) passes for OC_VM_RES_DISK only
 *
 * Returns the open fd (>= 0) on success; -1 with errno set on any failure.
 *
 * TOCTOU: the fd is opened before fstat, and the W_OK access(2) check is
 * advisory (access uses the real UID and re-stats the path).  Pass the
 * returned fd directly to the VZ attachment constructor without additional
 * filesystem operations on the path; the final binding happens at VZ time.
 *
 * The caller owns the returned fd.  Pass it to OCVMReleaseResourceFd or
 * directly to the VZ attachment constructor that will take ownership.
 */
int OCVMValidateResource(const char *path, OCVMResourceKind kind);

/*
 * OCVMReleaseResourceFd — close an fd returned by OCVMValidateResource.
 *
 * A no-op when fd < 0.
 */
void OCVMReleaseResourceFd(int fd);
