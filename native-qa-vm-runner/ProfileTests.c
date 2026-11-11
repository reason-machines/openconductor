#include "Profile.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned calls;

static bool build(void *context) {
    ++calls;
    return context != NULL;
}

static void check(bool condition, const char *message) {
    if (!condition) {
        fprintf(stderr, "FAIL: %s\n", message);
        exit(1);
    }
}

static void rejected(const OCVMProfile *profile) {
    calls = 0;
    check(!OCVMPrepareConfiguration(profile, build, &calls),
          "unsupported profile must be refused");
    check(calls == 0, "refusal must precede configuration construction");
}

int main(void) {
    OCVMProfile profile = OCVMClosedProfile();
    OCVMDevice devices[7];
    memcpy(devices, profile.devices, profile.device_count * sizeof(*devices));
    profile.devices = devices;

    for (int extra = OC_VM_NETWORK; extra <= OC_VM_CUSTOM_DEVICE; ++extra) {
        devices[6] = (OCVMDevice)extra;
        profile.device_count = 7;
        rejected(&profile);
        profile.device_count = 6;
        OCVMDevice saved = devices[2];
        devices[2] = (OCVMDevice)extra;
        rejected(&profile);
        devices[2] = saved;
    }
    devices[6] = (OCVMDevice)999;
    profile.device_count = 7;
    rejected(&profile);
    profile = OCVMClosedProfile();
    profile.unknown_configuration_keys = 1;
    rejected(&profile);
    profile = OCVMClosedProfile();
    profile.version = 0;
    rejected(&profile);
    profile = OCVMClosedProfile();
    profile.cpu_count = 3;
    rejected(&profile);
    profile = OCVMClosedProfile();
    profile.memory_bytes = OC_VM_MEMORY_BYTES + 1;
    rejected(&profile);
    profile = OCVMClosedProfile();
    profile.device_count = 5;
    rejected(&profile);
    profile.device_count = SIZE_MAX;
    rejected(&profile);
    profile = OCVMClosedProfile();
    profile.devices = NULL;
    rejected(&profile);
    rejected(NULL);
    profile = OCVMClosedProfile();
    memcpy(devices, profile.devices, profile.device_count * sizeof(*devices));
    devices[5] = devices[4];
    profile.devices = devices;
    rejected(&profile);

    profile = OCVMClosedProfile();
    calls = 0;
    check(OCVMPrepareConfiguration(&profile, build, &calls),
          "closed profile must reach configuration builder");
    check(calls == 1, "positive control must construct exactly once");
    calls = 0;
    check(!OCVMPrepareConfiguration(&profile, build, NULL),
          "builder failure must propagate");
    check(calls == 1, "builder failure must not retry");
    check(!OCVMPrepareConfiguration(&profile, NULL, NULL),
          "missing builder must be refused");
    puts("PASS: closed-profile construction, forbidden attachments, unknown keys, budgets, no retry");
    return 0;
}
