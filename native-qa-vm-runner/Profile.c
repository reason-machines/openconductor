#include "Profile.h"

static const OCVMDevice devices[] = {
    OC_VM_MAC_PLATFORM, OC_VM_MAC_BOOT_LOADER, OC_VM_BLOCK_DISK,
    OC_VM_MAC_DISPLAY, OC_VM_USB_KEYBOARD, OC_VM_USB_POINTER
};

OCVMProfile OCVMClosedProfile(void) {
    return (OCVMProfile){OC_VM_PROFILE_VERSION, OC_VM_CPU_COUNT,
        OC_VM_MEMORY_BYTES, devices, sizeof(devices) / sizeof(*devices), 0};
}

bool OCVMValidateProfile(const OCVMProfile *profile) {
    if (profile == NULL || profile->version != OC_VM_PROFILE_VERSION ||
        profile->cpu_count != OC_VM_CPU_COUNT ||
        profile->memory_bytes != OC_VM_MEMORY_BYTES ||
        profile->unknown_configuration_keys != 0 || profile->devices == NULL ||
        profile->device_count != sizeof(devices) / sizeof(*devices)) {
        return false;
    }
    for (size_t i = 0; i < profile->device_count; ++i) {
        if (profile->devices[i] != devices[i]) {
            return false;
        }
    }
    return true;
}

bool OCVMPrepareConfiguration(const OCVMProfile *profile,
                              OCVMConfigurationBuilder build, void *context) {
    return OCVMValidateProfile(profile) && build != NULL && build(context);
}
