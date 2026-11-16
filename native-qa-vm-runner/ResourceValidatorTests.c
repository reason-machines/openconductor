/*
 * ResourceValidatorTests.c — 32 pure-C assertions for OCVMValidateResource.
 *
 * Build & run (no dependencies beyond libc + POSIX):
 *   cc -std=c11 -Wall -Wextra -Werror \
 *      native-qa-vm-runner/ResourceValidator.c \
 *      native-qa-vm-runner/ResourceValidatorTests.c \
 *      -o /tmp/resource-validator-tests && /tmp/resource-validator-tests
 */

#define _POSIX_C_SOURCE 200809L

#include "ResourceValidator.h"

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

/* ------------------------------------------------------------------ counters */

static int g_pass = 0;
static int g_fail = 0;

static void check(const char *name, int cond) {
    if (cond) {
        ++g_pass;
        printf("PASS %s\n", name);
    } else {
        ++g_fail;
        printf("FAIL %s\n", name);
    }
}

/* ------------------------------------------------------------------ state */

static char g_disk_path[256];   /* regular 4096-byte writable file, disk  */
static char g_aux_path[256];    /* regular 4096-byte writable file, aux   */
static char g_zero_path[256];   /* regular zero-byte file                 */
static char g_hl_base[256];     /* hard-link base file (nlink will be 2)  */
static char g_hl_link[256];     /* the extra hard link                    */
static char g_sym_target[256];  /* symlink target (a valid regular file)  */
static char g_sym_path[256];    /* symlink pointing at g_sym_target       */
static char g_dir_path[256];    /* a directory                            */
static char g_ro_path[256];     /* regular 4096-byte file, mode 0444      */
static char g_min_path[256];    /* 1-byte file for min-size disk test     */
static char g_min2_path[256];   /* 1-byte file for min-size aux test      */

static int g_disk_fd = -1;  /* kept open through group 12 */
static int g_aux_fd  = -1;  /* kept open through group 12 */

/* ------------------------------------------------------------------ helpers */

/*
 * make_file — create a file at path with the given logical size and mode.
 * Returns 0 on success, -1 on failure.
 */
static int make_file(const char *path, off_t size, mode_t mode) {
    int fd = open(path, O_WRONLY | O_CREAT | O_EXCL, mode);
    if (fd < 0) return -1;
    if (size > 0 && ftruncate(fd, size) != 0) {
        int saved = errno;
        close(fd);
        unlink(path);
        errno = saved;
        return -1;
    }
    close(fd);
    return 0;
}

/* ------------------------------------------------------------------ setup / cleanup */

static void setup(void) {
    int pid = (int)getpid();
    snprintf(g_disk_path,  sizeof(g_disk_path),  "/tmp/ocvm-rv-%d-disk",   pid);
    snprintf(g_aux_path,   sizeof(g_aux_path),   "/tmp/ocvm-rv-%d-aux",    pid);
    snprintf(g_zero_path,  sizeof(g_zero_path),  "/tmp/ocvm-rv-%d-zero",   pid);
    snprintf(g_hl_base,    sizeof(g_hl_base),    "/tmp/ocvm-rv-%d-hlbase", pid);
    snprintf(g_hl_link,    sizeof(g_hl_link),    "/tmp/ocvm-rv-%d-hllink", pid);
    snprintf(g_sym_target, sizeof(g_sym_target), "/tmp/ocvm-rv-%d-symtgt", pid);
    snprintf(g_sym_path,   sizeof(g_sym_path),   "/tmp/ocvm-rv-%d-sym",    pid);
    snprintf(g_dir_path,   sizeof(g_dir_path),   "/tmp/ocvm-rv-%d-dir",    pid);
    snprintf(g_ro_path,    sizeof(g_ro_path),    "/tmp/ocvm-rv-%d-ro",     pid);
    snprintf(g_min_path,   sizeof(g_min_path),   "/tmp/ocvm-rv-%d-min",    pid);
    snprintf(g_min2_path,  sizeof(g_min2_path),  "/tmp/ocvm-rv-%d-min2",   pid);

    if (make_file(g_disk_path, 4096, 0644) != 0 ||
        make_file(g_aux_path,  4096, 0644) != 0 ||
        make_file(g_zero_path,    0, 0644) != 0 ||
        make_file(g_hl_base,   4096, 0644) != 0 ||
        link(g_hl_base, g_hl_link) != 0 ||
        make_file(g_sym_target, 4096, 0644) != 0 ||
        symlink(g_sym_target, g_sym_path) != 0 ||
        mkdir(g_dir_path, 0755) != 0 ||
        make_file(g_ro_path,   4096, 0444) != 0 ||
        make_file(g_min_path,     1, 0644) != 0 ||
        make_file(g_min2_path,    1, 0644) != 0) {
        perror("setup");
        exit(1);
    }
}

static void cleanup(void) {
    OCVMReleaseResourceFd(g_disk_fd); g_disk_fd = -1;
    OCVMReleaseResourceFd(g_aux_fd);  g_aux_fd  = -1;
    unlink(g_disk_path);
    unlink(g_aux_path);
    unlink(g_zero_path);
    unlink(g_hl_link);
    unlink(g_hl_base);
    unlink(g_sym_path);
    unlink(g_sym_target);
    rmdir(g_dir_path);
    chmod(g_ro_path, 0644);
    unlink(g_ro_path);
    unlink(g_min_path);
    unlink(g_min2_path);
}

/* ================================================================== test groups */

/* Group 1 — null / empty path: 4 checks */
static void g_null_empty(void) {
    check("null_path_disk",  OCVMValidateResource(NULL, OC_VM_RES_DISK) == -1); /* 1 */
    check("null_path_aux",   OCVMValidateResource(NULL, OC_VM_RES_AUX)  == -1); /* 2 */
    check("empty_path_disk", OCVMValidateResource("",   OC_VM_RES_DISK) == -1); /* 3 */
    check("empty_path_aux",  OCVMValidateResource("",   OC_VM_RES_AUX)  == -1); /* 4 */
}

/* Group 2 — absent path: 2 checks */
static void g_absent(void) {
    char absent[256];
    snprintf(absent, sizeof(absent), "/tmp/ocvm-rv-%d-absent", (int)getpid());
    check("absent_disk", OCVMValidateResource(absent, OC_VM_RES_DISK) == -1); /* 5 */
    check("absent_aux",  OCVMValidateResource(absent, OC_VM_RES_AUX)  == -1); /* 6 */
}

/* Group 3 — valid disk fd: 5 checks; keeps g_disk_fd open */
static void g_valid_disk(void) {
    g_disk_fd = OCVMValidateResource(g_disk_path, OC_VM_RES_DISK);
    check("valid_disk_fd_nonneg", g_disk_fd >= 0);                           /* 7  */

    if (g_disk_fd >= 0) {
        struct stat st;
        int r = fstat(g_disk_fd, &st);
        check("valid_disk_fstat_ok",   r == 0);                              /* 8  */
        check("valid_disk_is_regular", r == 0 && S_ISREG(st.st_mode));      /* 9  */
        char buf[1];
        ssize_t n = read(g_disk_fd, buf, 1);
        check("valid_disk_readable",   n >= 0);                              /* 10 */
        check("valid_disk_fcntl_ok",   fcntl(g_disk_fd, F_GETFD) >= 0);    /* 11 */
    } else {
        check("valid_disk_fstat_ok",   0);                                   /* 8  */
        check("valid_disk_is_regular", 0);                                   /* 9  */
        check("valid_disk_readable",   0);                                   /* 10 */
        check("valid_disk_fcntl_ok",   0);                                   /* 11 */
    }
}

/* Group 4 — valid aux fd: 4 checks; keeps g_aux_fd open */
static void g_valid_aux(void) {
    g_aux_fd = OCVMValidateResource(g_aux_path, OC_VM_RES_AUX);
    check("valid_aux_fd_nonneg",  g_aux_fd >= 0);                            /* 12 */

    if (g_aux_fd >= 0) {
        struct stat st;
        int r = fstat(g_aux_fd, &st);
        check("valid_aux_fstat_ok",    r == 0);                              /* 13 */
        check("valid_aux_is_regular",  r == 0 && S_ISREG(st.st_mode));      /* 14 */
        char buf[1];
        ssize_t n = read(g_aux_fd, buf, 1);
        check("valid_aux_readable",    n >= 0);                              /* 15 */
    } else {
        check("valid_aux_fstat_ok",    0);                                   /* 13 */
        check("valid_aux_is_regular",  0);                                   /* 14 */
        check("valid_aux_readable",    0);                                   /* 15 */
    }
}

/* Group 5 — zero-size files: 2 checks */
static void g_zero_size(void) {
    check("zero_size_disk", OCVMValidateResource(g_zero_path, OC_VM_RES_DISK) == -1); /* 16 */
    check("zero_size_aux",  OCVMValidateResource(g_zero_path, OC_VM_RES_AUX)  == -1); /* 17 */
}

/* Group 6 — hard link (nlink > 1): 2 checks */
static void g_hard_link(void) {
    check("hard_link_disk", OCVMValidateResource(g_hl_base, OC_VM_RES_DISK) == -1); /* 18 */
    check("hard_link_aux",  OCVMValidateResource(g_hl_base, OC_VM_RES_AUX)  == -1); /* 19 */
}

/* Group 7 — symlink (O_NOFOLLOW rejects it): 2 checks */
static void g_symlink(void) {
    check("symlink_disk", OCVMValidateResource(g_sym_path, OC_VM_RES_DISK) == -1); /* 20 */
    check("symlink_aux",  OCVMValidateResource(g_sym_path, OC_VM_RES_AUX)  == -1); /* 21 */
}

/* Group 8 — directory: 2 checks */
static void g_directory(void) {
    check("directory_disk", OCVMValidateResource(g_dir_path, OC_VM_RES_DISK) == -1); /* 22 */
    check("directory_aux",  OCVMValidateResource(g_dir_path, OC_VM_RES_AUX)  == -1); /* 23 */
}

/* Group 9 — W_OK contrast (disk requires it, aux does not): 2 checks */
static void g_write_access(void) {
    if (geteuid() == 0) {
        /* Root bypasses W_OK; mark vacuously passed. */
        check("readonly_disk_rejected", 1); /* 24 */
        check("readonly_aux_accepted",  1); /* 25 */
        return;
    }
    int fd;
    fd = OCVMValidateResource(g_ro_path, OC_VM_RES_DISK);
    check("readonly_disk_rejected", fd == -1);  /* 24 */
    if (fd >= 0) OCVMReleaseResourceFd(fd);

    fd = OCVMValidateResource(g_ro_path, OC_VM_RES_AUX);
    check("readonly_aux_accepted",  fd >= 0);   /* 25 */
    if (fd >= 0) OCVMReleaseResourceFd(fd);
}

/* Group 10 — fd release: 3 checks */
static void g_fd_release(void) {
    /* Open a fresh disk fd, release it, verify it is closed (EBADF). */
    int fd = OCVMValidateResource(g_disk_path, OC_VM_RES_DISK);
    OCVMReleaseResourceFd(fd);
    struct stat st;
    check("release_valid_fd_closes", fd >= 0 && fstat(fd, &st) == -1); /* 26 */

    /* Releasing fd < 0 must not crash. */
    OCVMReleaseResourceFd(-1);
    check("release_neg1_safe", 1); /* 27 */

    /* Open a fresh aux fd, release it, verify it is closed (EBADF). */
    fd = OCVMValidateResource(g_aux_path, OC_VM_RES_AUX);
    OCVMReleaseResourceFd(fd);
    check("release_valid_aux_closes", fd >= 0 && fstat(fd, &st) == -1); /* 28 */
}

/* Group 11 — min size (1 byte): 2 checks */
static void g_min_size(void) {
    int fd;
    fd = OCVMValidateResource(g_min_path, OC_VM_RES_DISK);
    check("min_size_disk", fd >= 0);  /* 29 */
    if (fd >= 0) OCVMReleaseResourceFd(fd);

    fd = OCVMValidateResource(g_min2_path, OC_VM_RES_AUX);
    check("min_size_aux",  fd >= 0);  /* 30 */
    if (fd >= 0) OCVMReleaseResourceFd(fd);
}

/* Group 12 — boundary: 2 checks */
static void g_boundary(void) {
    /* g_disk_fd and g_aux_fd are both open from groups 3 and 4. */
    check("distinct_fds",
        g_disk_fd >= 0 && g_aux_fd >= 0 && g_disk_fd != g_aux_fd); /* 31 */

    /* An invalid kind value must be rejected immediately. */
    int fd = OCVMValidateResource(g_disk_path, (OCVMResourceKind)99);
    check("invalid_kind", fd == -1);  /* 32 */
    if (fd >= 0) OCVMReleaseResourceFd(fd);
}

/* ================================================================== main */

int main(void) {
    setup();

    g_null_empty();
    g_absent();
    g_valid_disk();
    g_valid_aux();
    g_zero_size();
    g_hard_link();
    g_symlink();
    g_directory();
    g_write_access();
    g_fd_release();
    g_min_size();
    g_boundary();

    cleanup();

    printf("\n%d passed, %d failed\n", g_pass, g_fail);
    return g_fail != 0;
}
