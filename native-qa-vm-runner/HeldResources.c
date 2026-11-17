#define _POSIX_C_SOURCE 200809L
#include "HeldResources.h"
#include "ResourceValidator.h"
#include <fcntl.h>
#include <stddef.h>
#include <unistd.h>

void OCVMInitResources(OCVMHeldResources *resources) {
    if (resources == NULL) return;
    *resources = (OCVMHeldResources){0};
    for (unsigned i = 0; i < OC_VM_RESOURCE_COUNT; ++i) resources->fds[i] = -1;
}

void OCVMReleaseResources(OCVMHeldResources *resources) {
    if (resources == NULL) return;
    for (unsigned i = 0; i < OC_VM_RESOURCE_COUNT; ++i) {
        OCVMReleaseResourceFd(resources->fds[i]);
        resources->fds[i] = -1;
    }
}

static bool OCVMSameSnapshot(const struct stat *a, const struct stat *b) {
    return a->st_dev == b->st_dev && a->st_ino == b->st_ino &&
        a->st_mode == b->st_mode && a->st_uid == b->st_uid &&
        a->st_gid == b->st_gid && a->st_nlink == 1 && b->st_nlink == 1 &&
        a->st_size == b->st_size && a->st_mtime == b->st_mtime &&
        a->st_ctime == b->st_ctime;
}

bool OCVMResourcesMatch(const OCVMHeldResources *resources) {
    if (resources == NULL) return false;
    for (unsigned i = 0; i < OC_VM_RESOURCE_COUNT; ++i) {
        struct stat held, named;
        if (resources->fds[i] < 0 || resources->paths[i] == NULL ||
            fstat(resources->fds[i], &held) != 0 ||
            lstat(resources->paths[i], &named) != 0 ||
            !OCVMSameSnapshot(&resources->identities[i], &held) ||
            !OCVMSameSnapshot(&held, &named)) return false;
    }
    return true;
}

int OCVMHoldResources(const OCVMArgs *args, OCVMHeldResources *resources) {
    if (args == NULL || resources == NULL) return 78;
    /* Refuse reinitializing a live owner: never silently leak its descriptors. */
    for (unsigned i = 0; i < OC_VM_RESOURCE_COUNT; ++i) {
        if (resources->fds[i] != -1) return 78;
    }
    if (args->hardware_model == NULL || args->machine_id == NULL) return 78;
    const char *paths[] = {args->disk, args->aux, args->hardware_model, args->machine_id};
    for (unsigned i = 0; i < OC_VM_RESOURCE_COUNT; ++i) {
        resources->paths[i] = paths[i];
        int fd = OCVMValidateResource(paths[i], i == 0 ? OC_VM_RES_DISK : OC_VM_RES_AUX);
        resources->fds[i] = fd;
        if (fd < 0 || fcntl(fd, F_SETFD, FD_CLOEXEC) != 0 ||
            fstat(fd, &resources->identities[i]) != 0) {
            OCVMReleaseResources(resources);
            return 11 + (int)i;
        }
        for (unsigned previous = 0; previous < i; ++previous) {
            if (resources->identities[i].st_dev == resources->identities[previous].st_dev &&
                resources->identities[i].st_ino == resources->identities[previous].st_ino) {
                OCVMReleaseResources(resources);
                return 11 + (int)i;
            }
        }
    }
    if (!OCVMResourcesMatch(resources)) {
        OCVMReleaseResources(resources);
        return 78;
    }
    return 0;
}
