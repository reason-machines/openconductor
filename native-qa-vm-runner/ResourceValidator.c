#define _POSIX_C_SOURCE 200809L
#include "ResourceValidator.h"

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

OCVMResourceStatus OCVMValidateResource(const char *path,
                                        OCVMResourceKind kind,
                                        OCVMResourceIdentity *out) {
    out->fd = -1;

    if (path == NULL || path[0] == '\0') {
        return OC_VM_RESOURCE_BAD_PATH;
    }

    /*
     * O_NOFOLLOW refuses a symlink at the final path component:
     *   Linux  — returns ELOOP when the final component is a symlink.
     *   macOS  — returns ENOTDIR (or ELOOP on some paths).
     * Either way open() fails and we report OC_VM_RESOURCE_IS_SYMLINK.
     *
     * O_NONBLOCK prevents blocking on FIFOs or other special files.
     */
    int flags = O_RDONLY | O_NOFOLLOW | O_NONBLOCK;
    int fd = open(path, flags);
    if (fd < 0) {
        int e = errno;
        if (e == ELOOP
#ifdef ENOTDIR
            /* macOS uses ENOTDIR for O_NOFOLLOW on a symlink in some cases. */
            || (e == ENOTDIR && lstat(path, &(struct stat){0}) == 0)
#endif
        ) {
            return OC_VM_RESOURCE_IS_SYMLINK;
        }
        return OC_VM_RESOURCE_OPEN_FAILED;
    }

    struct stat st;
    if (fstat(fd, &st) < 0) {
        close(fd);
        return OC_VM_RESOURCE_STAT_FAILED;
    }

    /* Reject non-regular files (devices, FIFOs, directories, symlinks). */
    if (!S_ISREG(st.st_mode)) {
        close(fd);
        return OC_VM_RESOURCE_NOT_REGULAR;
    }

    /* Reject hard links; guest resources must have exactly one link count. */
    if (st.st_nlink != 1) {
        close(fd);
        return OC_VM_RESOURCE_HARD_LINKED;
    }

    /* Caller must own the file. */
    if (st.st_uid != geteuid()) {
        close(fd);
        return OC_VM_RESOURCE_WRONG_OWNER;
    }

    /* Size bounds. */
    uint64_t max_bytes = (kind == OC_VM_RESOURCE_DISK)
        ? OC_VM_MAX_DISK_BYTES : OC_VM_MAX_AUX_BYTES;
    if ((uint64_t)st.st_size < (uint64_t)OC_VM_MIN_RESOURCE_BYTES ||
        (uint64_t)st.st_size > max_bytes) {
        close(fd);
        return OC_VM_RESOURCE_BAD_SIZE;
    }

    /* Disk resources must also be writable by the caller (W_OK via access). */
    if (kind == OC_VM_RESOURCE_DISK) {
        if (access(path, W_OK) != 0) {
            close(fd);
            return OC_VM_RESOURCE_NOT_WRITABLE;
        }
    }

    out->dev   = st.st_dev;
    out->ino   = st.st_ino;
    out->size  = st.st_size;
    out->nlink = st.st_nlink;
    out->uid   = st.st_uid;
    out->mode  = (mode_t)(st.st_mode & (mode_t)07777);
    out->fd    = fd;
    return OC_VM_RESOURCE_OK;
}

void OCVMReleaseResource(OCVMResourceIdentity *identity) {
    if (identity->fd >= 0) {
        close(identity->fd);
        identity->fd = -1;
    }
}
