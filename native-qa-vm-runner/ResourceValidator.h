#ifndef OC_QA_VM_RESOURCE_VALIDATOR_H
#define OC_QA_VM_RESOURCE_VALIDATOR_H

/*
 * C-level resource validation for QA VM guest resource files.
 *
 * OCVMValidateResource opens a resource file with O_RDONLY|O_NOFOLLOW so
 * the final path component is never a symlink, then fstat()s the open fd
 * to capture filesystem identity (dev, ino, size, nlink, uid, mode).
 *
 * This sits between OCVMParseArgs (string validation) and the VZ framework
 * calls (macOS-only): it is the last pure-POSIX, ubuntu-testable step before
 * VZDiskImageStorageDeviceAttachment and VZMacAuxiliaryStorage are created.
 *
 * It does NOT close the TOCTOU window between fstat and execve/VZ-open;
 * that requires O_PATH-pinned fds or equivalent and is E1's native
 * responsibility.  This module only refuses obviously unsafe inputs before
 * any VZ object is constructed.
 *
 * Resource kinds:
 *   OC_VM_RESOURCE_DISK — the disposable disk image; must be writable by the
 *                         caller (checked via access(2) with W_OK).
 *   OC_VM_RESOURCE_AUX  — the auxiliary NVRAM storage; read access only.
 */

#include <stdint.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#define OC_VM_MIN_RESOURCE_BYTES  1
/* 16 GiB — smallest plausible macOS installer base image. */
#define OC_VM_MAX_DISK_BYTES      (UINT64_C(16) * 1024 * 1024 * 1024)
/* 128 MiB — VZ NVRAM is typically under 1 MiB; 128 MiB is generous. */
#define OC_VM_MAX_AUX_BYTES       (UINT64_C(128) * 1024 * 1024)

typedef enum {
    OC_VM_RESOURCE_DISK = 0,
    OC_VM_RESOURCE_AUX  = 1,
} OCVMResourceKind;

typedef enum {
    /* File opened and validated; identity captured in *out. */
    OC_VM_RESOURCE_OK            = 0,
    /* Path is NULL or empty. */
    OC_VM_RESOURCE_BAD_PATH      = 1,
    /* open() failed (file absent, permissions, path too long, etc.). */
    OC_VM_RESOURCE_OPEN_FAILED   = 2,
    /* fstat() on the open fd failed. */
    OC_VM_RESOURCE_STAT_FAILED   = 3,
    /* File is a symlink (O_NOFOLLOW errno ELOOP on Linux, ENOTDIR on macOS). */
    OC_VM_RESOURCE_IS_SYMLINK    = 4,
    /* File is not a regular file. */
    OC_VM_RESOURCE_NOT_REGULAR   = 5,
    /* File has more than one hard link. */
    OC_VM_RESOURCE_HARD_LINKED   = 6,
    /* File is not owned by the calling process's effective UID. */
    OC_VM_RESOURCE_WRONG_OWNER   = 7,
    /* File size is outside the [min, max] range for its kind. */
    OC_VM_RESOURCE_BAD_SIZE      = 8,
    /* access(2) W_OK check failed for a DISK resource. */
    OC_VM_RESOURCE_NOT_WRITABLE  = 9,
} OCVMResourceStatus;

/* Captured filesystem identity, valid only when status == OC_VM_RESOURCE_OK. */
typedef struct {
    dev_t  dev;
    ino_t  ino;
    off_t  size;
    nlink_t nlink;
    uid_t  uid;
    mode_t mode;      /* S_IMODE permission bits only */
    /* The open file descriptor; caller must close() it after use or on error. */
    int    fd;
} OCVMResourceIdentity;

/*
 * Validate a guest resource file and capture its filesystem identity.
 *
 * path  : NUL-terminated absolute path, non-NULL.
 * kind  : OC_VM_RESOURCE_DISK or OC_VM_RESOURCE_AUX.
 * out   : must not be NULL; populated on OC_VM_RESOURCE_OK.
 *
 * On OC_VM_RESOURCE_OK, out->fd is an open O_RDONLY fd that the caller must
 * close().  On any other status, out->fd is -1.
 *
 * Returns OC_VM_RESOURCE_OK when the file passes all checks, or one of the
 * other OCVMResourceStatus codes on the first failing check.
 */
OCVMResourceStatus OCVMValidateResource(const char *path,
                                        OCVMResourceKind kind,
                                        OCVMResourceIdentity *out);

/*
 * Close the fd in *identity if it is >= 0 and reset it to -1.
 * Safe to call on an already-closed/reset identity.
 */
void OCVMReleaseResource(OCVMResourceIdentity *identity);

#endif /* OC_QA_VM_RESOURCE_VALIDATOR_H */
