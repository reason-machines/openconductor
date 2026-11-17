#ifndef OC_QA_VM_HELD_RESOURCES_H
#define OC_QA_VM_HELD_RESOURCES_H

#include <stdbool.h>
#include <sys/stat.h>
#include "ArgParser.h"

#define OC_VM_RESOURCE_COUNT 4u

typedef struct {
    int fds[OC_VM_RESOURCE_COUNT]; /* disk, auxiliary storage, hardware model, machine ID */
    const char *paths[OC_VM_RESOURCE_COUNT]; /* borrowed from invocation argv */
    struct stat identities[OC_VM_RESOURCE_COUNT];
} OCVMHeldResources;

/* Initialize once, before Hold. A failed Hold releases every acquired descriptor. */
void OCVMInitResources(OCVMHeldResources *resources);
/* Returns 0, a resource-specific failure (11..14), or 78 for missing identities. */
int OCVMHoldResources(const OCVMArgs *args, OCVMHeldResources *resources);
/* Detects observed path/descriptor identity and metadata changes; NOT race prevention.
 * VZ URL constructors do not consume these FDs. This is not atomic identity-through-use.
 */
bool OCVMResourcesMatch(const OCVMHeldResources *resources);
void OCVMReleaseResources(OCVMHeldResources *resources);

#endif
