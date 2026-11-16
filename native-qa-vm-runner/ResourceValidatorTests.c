#define _POSIX_C_SOURCE 200809L
#include "ResourceValidator.h"
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

static unsigned passed;
static unsigned failed;

static void check(int condition, const char *message) {
    if (condition) {
        ++passed;
    } else {
        ++failed;
        fprintf(stderr, "FAIL: %s\n", message);
    }
}

/* Write n bytes to path; return 0 on success. */
static int write_file(const char *path, size_t n) {
    int fd = open(path, O_WRONLY | O_CREAT | O_EXCL, 0600);
    if (fd < 0) return -1;
    char buf[256];
    memset(buf, 0x55, sizeof(buf));
    while (n > 0) {
        size_t chunk = n < sizeof(buf) ? n : sizeof(buf);
        ssize_t w = write(fd, buf, chunk);
        if (w < 0) { close(fd); return -1; }
        n -= (size_t)w;
    }
    close(fd);
    return 0;
}

static void test_null_path(const char *tmpdir) {
    OCVMResourceIdentity id;
    OCVMResourceStatus s = OCVMValidateResource(NULL, OC_VM_RESOURCE_DISK, &id);
    check(s == OC_VM_RESOURCE_BAD_PATH,  "NULL path → BAD_PATH");
    check(id.fd == -1,                   "NULL path → fd is -1");
    (void)tmpdir;
}

static void test_empty_path(const char *tmpdir) {
    OCVMResourceIdentity id;
    OCVMResourceStatus s = OCVMValidateResource("", OC_VM_RESOURCE_DISK, &id);
    check(s == OC_VM_RESOURCE_BAD_PATH, "empty path → BAD_PATH");
    (void)tmpdir;
}

static void test_absent_path(const char *tmpdir) {
    char path[512];
    snprintf(path, sizeof(path), "%s/does_not_exist", tmpdir);
    OCVMResourceIdentity id;
    OCVMResourceStatus s = OCVMValidateResource(path, OC_VM_RESOURCE_DISK, &id);
    check(s == OC_VM_RESOURCE_OPEN_FAILED, "absent path → OPEN_FAILED");
    check(id.fd == -1,                     "absent path → fd is -1");
}

static void test_valid_disk(const char *tmpdir) {
    char path[512];
    snprintf(path, sizeof(path), "%s/disk.img", tmpdir);
    check(write_file(path, 1024) == 0, "write_file for valid disk");
    OCVMResourceIdentity id;
    OCVMResourceStatus s = OCVMValidateResource(path, OC_VM_RESOURCE_DISK, &id);
    check(s == OC_VM_RESOURCE_OK, "valid disk → OK");
    check(id.fd >= 0,             "valid disk → fd >= 0");
    check(id.size == 1024,        "valid disk → size correct");
    check(id.nlink == 1,          "valid disk → nlink == 1");
    check((uid_t)id.uid == geteuid(), "valid disk → uid matches euid");
    OCVMReleaseResource(&id);
    check(id.fd == -1,            "release → fd is -1");
    unlink(path);
}

static void test_valid_aux(const char *tmpdir) {
    char path[512];
    snprintf(path, sizeof(path), "%s/aux.bin", tmpdir);
    check(write_file(path, 512) == 0, "write_file for valid aux");
    OCVMResourceIdentity id;
    OCVMResourceStatus s = OCVMValidateResource(path, OC_VM_RESOURCE_AUX, &id);
    check(s == OC_VM_RESOURCE_OK, "valid aux → OK");
    check(id.size == 512,         "valid aux → size correct");
    OCVMReleaseResource(&id);
    unlink(path);
}

static void test_zero_size_refused(const char *tmpdir) {
    char path[512];
    snprintf(path, sizeof(path), "%s/zero.img", tmpdir);
    /* Create a zero-byte file. */
    int fd = open(path, O_WRONLY | O_CREAT | O_EXCL, 0600);
    check(fd >= 0, "create zero-size file");
    if (fd >= 0) close(fd);
    OCVMResourceIdentity id;
    OCVMResourceStatus s = OCVMValidateResource(path, OC_VM_RESOURCE_DISK, &id);
    check(s == OC_VM_RESOURCE_BAD_SIZE, "zero size → BAD_SIZE");
    check(id.fd == -1,                  "zero size → fd is -1");
    unlink(path);
}

static void test_hard_link_refused(const char *tmpdir) {
    char orig[512], lnk[512];
    snprintf(orig, sizeof(orig), "%s/hard_orig.img", tmpdir);
    snprintf(lnk,  sizeof(lnk),  "%s/hard_link.img", tmpdir);
    check(write_file(orig, 512) == 0, "write hard link original");
    check(link(orig, lnk) == 0,    "create hard link");
    OCVMResourceIdentity id;
    /* The original now has nlink==2; validate it. */
    OCVMResourceStatus s = OCVMValidateResource(orig, OC_VM_RESOURCE_DISK, &id);
    check(s == OC_VM_RESOURCE_HARD_LINKED, "hard linked file → HARD_LINKED");
    check(id.fd == -1,                     "hard linked → fd is -1");
    unlink(orig);
    unlink(lnk);
}

static void test_symlink_refused(const char *tmpdir) {
    char target[512], linkpath[512];
    snprintf(target,   sizeof(target),   "%s/sym_target.img", tmpdir);
    snprintf(linkpath, sizeof(linkpath), "%s/sym_link.img",   tmpdir);
    check(write_file(target, 512) == 0,          "write symlink target");
    check(symlink(target, linkpath) == 0,         "create symlink");
    OCVMResourceIdentity id;
    OCVMResourceStatus s = OCVMValidateResource(linkpath, OC_VM_RESOURCE_DISK, &id);
    check(s == OC_VM_RESOURCE_IS_SYMLINK || s == OC_VM_RESOURCE_OPEN_FAILED,
          "symlink → IS_SYMLINK or OPEN_FAILED (platform-dependent)");
    check(id.fd == -1, "symlink → fd is -1");
    unlink(target);
    unlink(linkpath);
}

static void test_directory_refused(const char *tmpdir) {
    char path[512];
    snprintf(path, sizeof(path), "%s/subdir", tmpdir);
    mkdir(path, 0700);
    OCVMResourceIdentity id;
    OCVMResourceStatus s = OCVMValidateResource(path, OC_VM_RESOURCE_DISK, &id);
    /* On Linux, open(O_RDONLY) on a directory succeeds; fstat sees S_ISDIR. */
    /* On macOS, open(O_RDONLY|O_NOFOLLOW) on a dir may also succeed. */
    check(s == OC_VM_RESOURCE_NOT_REGULAR || s == OC_VM_RESOURCE_OPEN_FAILED,
          "directory → NOT_REGULAR or OPEN_FAILED");
    check(id.fd == -1, "directory → fd is -1");
    rmdir(path);
}

static void test_fd_is_valid_after_ok(const char *tmpdir) {
    char path[512];
    snprintf(path, sizeof(path), "%s/fdfwd.img", tmpdir);
    check(write_file(path, 256) == 0, "write fdfwd file");
    OCVMResourceIdentity id;
    OCVMResourceStatus s = OCVMValidateResource(path, OC_VM_RESOURCE_DISK, &id);
    check(s == OC_VM_RESOURCE_OK, "fd-forward: OK");
    if (s == OC_VM_RESOURCE_OK) {
        /* Can read a byte from the fd. */
        char buf[1];
        check(pread(id.fd, buf, 1, 0) == 1, "fd is readable after OK");
        OCVMReleaseResource(&id);
    }
    unlink(path);
}

static void test_release_idempotent(const char *tmpdir) {
    OCVMResourceIdentity id;
    id.fd = -1;
    OCVMReleaseResource(&id);
    check(id.fd == -1, "release on fd=-1 is idempotent");
    (void)tmpdir;
}

int main(void) {
    char tmpdir[] = "/tmp/ocresval-XXXXXX";
    char *dir = mkdtemp(tmpdir);
    if (dir == NULL) {
        fprintf(stderr, "mkdtemp failed\n");
        return 1;
    }

    test_null_path(dir);
    test_empty_path(dir);
    test_absent_path(dir);
    test_valid_disk(dir);
    test_valid_aux(dir);
    test_zero_size_refused(dir);
    test_hard_link_refused(dir);
    test_symlink_refused(dir);
    test_directory_refused(dir);
    test_fd_is_valid_after_ok(dir);
    test_release_idempotent(dir);

    rmdir(dir);
    printf("ResourceValidator: %u passed, %u failed\n", passed, failed);
    return failed > 0 ? 1 : 0;
}
