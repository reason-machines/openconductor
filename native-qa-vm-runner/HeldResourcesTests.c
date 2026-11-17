#define _POSIX_C_SOURCE 200809L
#include "HeldResources.h"
#include "Lifecycle.h"
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static void write_file(const char *path) {
    int fd = open(path, O_CREAT | O_EXCL | O_WRONLY, 0600);
    assert(fd >= 0);
    assert(write(fd, "fixture", 7) == 7);
    assert(close(fd) == 0);
}

static unsigned open_count(void) {
    unsigned count = 0;
    for (int fd = 0; fd < 256; ++fd) if (fcntl(fd, F_GETFD) >= 0) ++count;
    return count;
}

static void assert_released(const OCVMHeldResources *resources) {
    for (unsigned i = 0; i < OC_VM_RESOURCE_COUNT; ++i) assert(resources->fds[i] == -1);
}

int main(void) {
    char root[] = "/tmp/oc-held-resources-XXXXXX";
    assert(mkdtemp(root) != NULL);
    char paths[4][256];
    for (unsigned i = 0; i < 4; ++i) {
        assert(snprintf(paths[i], sizeof(paths[i]), "%s/%u", root, i) > 0);
        write_file(paths[i]);
    }
    OCVMArgs args = {paths[0], paths[1], paths[2], paths[3]};
    OCVMHeldResources resources;
    OCVMInitResources(&resources);
    unsigned baseline = open_count();
    assert(!OCVMResourcesMatch(&resources));
    assert(OCVMHoldResources(&args, &resources) == 0);
    assert(open_count() == baseline + 4);
    assert(OCVMResourcesMatch(&resources));
    int retained[4];
    memcpy(retained, resources.fds, sizeof(retained));
    for (unsigned i = 0; i < 4; ++i) assert(fcntl(retained[i], F_GETFD) & FD_CLOEXEC);
    /* Attempting to reuse a live owner cannot reset or leak it. */
    assert(OCVMHoldResources(&args, &resources) == 78);
    assert(OCVMResourcesMatch(&resources));
    /* A replacement path is detected without losing the original open object. */
    assert(unlink(paths[0]) == 0);
    write_file(paths[0]);
    assert(!OCVMResourcesMatch(&resources));
    char first;
    assert(pread(retained[0], &first, 1, 0) == 1 && first == 'f');
    OCVMReleaseResources(&resources);
    assert_released(&resources);
    for (unsigned i = 0; i < 4; ++i) {
        errno = 0;
        assert(fcntl(retained[i], F_GETFD) == -1 && errno == EBADF);
    }
    OCVMReleaseResources(&resources); /* idempotent cleanup */
    assert(open_count() == baseline);

    /* Compose the real C owners with synthetic VM events. A stop callback and
     * a different VM's stopped observation must not release held resources.
     */
    OCVMLifecycle lifecycle;
    assert(OCVMHoldResources(&args, &resources) == 0);
    assert(OCVMLifecycleInit(&lifecycle, 41, 1, 100, 10));
    assert(OCVMLifecycleBeginStart(&lifecycle, 41, 2));
    assert(OCVMLifecycleDidStart(&lifecycle, 41, true, 3));
    assert(OCVMLifecycleRequestStop(&lifecycle, 41, OC_VM_FAILURE_WORKLOAD_UNSUPPORTED, 4));
    assert(OCVMLifecycleBeginStop(&lifecycle, 41, 5));
    assert(OCVMLifecycleDidStop(&lifecycle, 41, true, 6));
    assert(!OCVMLifecycleCanRelease(&lifecycle));
    assert(!OCVMLifecycleObserveStopped(&lifecycle, 42, 7));
    assert(OCVMResourcesMatch(&resources));
    assert(open_count() == baseline + 4);
    assert(OCVMLifecycleObserveStopped(&lifecycle, 41, 8));
    assert(OCVMLifecycleCanRelease(&lifecycle));
    OCVMReleaseResources(&resources);
    assert(open_count() == baseline);

    /* Failed/unconfirmed stop retains ownership rather than pretending cleanup. */
    assert(OCVMHoldResources(&args, &resources) == 0);
    assert(OCVMLifecycleInit(&lifecycle, 41, 1, 100, 10));
    assert(OCVMLifecycleBeginStart(&lifecycle, 41, 2));
    assert(OCVMLifecycleDidStart(&lifecycle, 41, true, 3));
    assert(OCVMLifecycleRequestStop(&lifecycle, 41, OC_VM_FAILURE_WORKLOAD_UNSUPPORTED, 4));
    assert(OCVMLifecycleBeginStop(&lifecycle, 41, 5));
    assert(OCVMLifecycleDidStop(&lifecycle, 41, false, 6));
    assert(OCVMLifecycleTick(&lifecycle, 41, 14));
    assert(lifecycle.phase == OC_VM_STOP_UNCONFIRMED);
    assert(!OCVMLifecycleCanRelease(&lifecycle));
    assert(open_count() == baseline + 4);
    assert(OCVMResourcesMatch(&resources));
    /* Only the later matching observation permits explicit fixture cleanup. */
    assert(OCVMLifecycleObserveStopped(&lifecycle, 41, 15));
    assert(OCVMLifecycleCanRelease(&lifecycle));
    OCVMReleaseResources(&resources);
    assert(open_count() == baseline);

    OCVMArgs missing = args;
    missing.hardware_model = NULL;
    assert(OCVMHoldResources(&missing, &resources) == 78);
    assert(open_count() == baseline);
    /* Each late acquisition failure closes all earlier descriptors. */
    for (unsigned i = 0; i < 4; ++i) {
        const char **fields[] = {&args.disk, &args.aux, &args.hardware_model, &args.machine_id};
        const char *saved = *fields[i];
        *fields[i] = "/nonexistent/oc-synthetic-resource";
        assert(OCVMHoldResources(&args, &resources) == 11 + (int)i);
        assert_released(&resources);
        assert(open_count() == baseline);
        *fields[i] = saved;
    }
    OCVMArgs alias = args;
    alias.aux = alias.disk;
    assert(OCVMHoldResources(&alias, &resources) == 12);
    assert_released(&resources);
    assert(open_count() == baseline);

    assert(OCVMHoldResources(&args, &resources) == 0);
    assert(unlink(paths[1]) == 0);
    assert(symlink(paths[0], paths[1]) == 0);
    assert(!OCVMResourcesMatch(&resources));
    OCVMReleaseResources(&resources);
    assert(open_count() == baseline);
    assert(OCVMHoldResources(&args, &resources) == 12);
    assert_released(&resources);
    assert(open_count() == baseline);
    for (unsigned i = 0; i < 4; ++i) assert(unlink(paths[i]) == 0);
    assert(rmdir(root) == 0);
    puts("HeldResources: ownership, failure cleanup and observed replacement refusal passed (synthetic only)");
    return 0;
}
