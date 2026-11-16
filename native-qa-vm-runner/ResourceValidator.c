/*
 * ResourceValidator.c — C-level identity validation for VM disk/aux resources.
 *
 * Pure POSIX C; no Virtualization framework dependency.  Compiled separately
 * into ResourceValidator.o and linked with Runner.m.
 */

#define _POSIX_C_SOURCE 200809L

#include "ResourceValidator.h"

#include <errno.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

/* Upper size limits for each resource kind. */
#define OC_VM_RES_SIZE_MIN    ((off_t)1)
#define OC_VM_RES_DISK_MAX    ((off_t)(256LL * 1024 * 1024 * 1024)) /* 256 GiB */
#define OC_VM_RES_AUX_MAX     ((off_t)(  4LL * 1024 * 1024 * 1024)) /*   4 GiB */

int OCVMValidateResource(const char *path, OCVMResourceKind kind) {
    if (path == NULL || path[0] == '\0') {
        errno = EINVAL;
        return -1;
    }
    if (kind != OC_VM_RES_DISK && kind != OC_VM_RES_AUX) {
        errno = EINVAL;
        return -1;
    }

    /*
     * O_RDONLY   — no write intent; the VZ attachment opens its own handle.
     * O_NOFOLLOW — reject a symlink at the final path component (TOCTOU guard).
     * O_NONBLOCK — avoid blocking on a FIFO or device node if the path is wrong.
     */
    int fd = open(path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    if (fd < 0) {
        return -1;
    }

    struct stat st;
    if (fstat(fd, &st) != 0) {
        close(fd);
        return -1;
    }

    /* Must be a regular file — no directories, devices or fifos. */
    if (!S_ISREG(st.st_mode)) {
        close(fd);
        errno = EINVAL;
        return -1;
    }

    /* Exactly one hard link: no aliasing via multiple directory entries. */
    if (st.st_nlink != 1) {
        close(fd);
        errno = EINVAL;
        return -1;
    }

    /* File must be owned by the effective user of this process. */
    if (st.st_uid != geteuid()) {
        close(fd);
        errno = EACCES;
        return -1;
    }

    /* At least one byte; at most the kind-specific ceiling. */
    off_t max_size = (kind == OC_VM_RES_DISK) ? OC_VM_RES_DISK_MAX : OC_VM_RES_AUX_MAX;
    if (st.st_size < OC_VM_RES_SIZE_MIN || st.st_size > max_size) {
        close(fd);
        errno = EINVAL;
        return -1;
    }

    /*
     * Disk images must be writable by this process: the VZ block attachment
     * opens them read-write.  Auxiliary storage is read-only to VZ so this
     * check is skipped.
     *
     * TOCTOU: access(2) uses the real UID and re-stats the path.  Pass the
     * returned fd directly to VZ construction without re-opening the path.
     */
    if (kind == OC_VM_RES_DISK && access(path, W_OK) != 0) {
        close(fd);
        return -1;
    }

    return fd;
}

void OCVMReleaseResourceFd(int fd) {
    if (fd >= 0) {
        close(fd);
    }
}
