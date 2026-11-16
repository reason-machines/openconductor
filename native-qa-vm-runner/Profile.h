#ifndef OC_QA_VM_PROFILE_H
#define OC_QA_VM_PROFILE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define OC_VM_PROFILE_VERSION 1u
#define OC_VM_CPU_COUNT 2u
#define OC_VM_MEMORY_BYTES (UINT64_C(4) * 1024 * 1024 * 1024)

typedef enum {
    OC_VM_MAC_PLATFORM,
    OC_VM_MAC_BOOT_LOADER,
    OC_VM_BLOCK_DISK,
    OC_VM_MAC_DISPLAY,
    OC_VM_USB_KEYBOARD,
    OC_VM_USB_POINTER,
    OC_VM_NETWORK,
    OC_VM_DIRECTORY_SHARE,
    OC_VM_SOCKET,
    OC_VM_SERIAL,
    OC_VM_CONSOLE,
    OC_VM_AUDIO,
    OC_VM_USB_CONTROLLER,
    OC_VM_ENTROPY,
    OC_VM_MEMORY_BALLOON,
    OC_VM_CUSTOM_DEVICE
} OCVMDevice;

typedef struct {
    unsigned version;
    unsigned cpu_count;
    uint64_t memory_bytes;
    const OCVMDevice *devices;
    size_t device_count;
    size_t unknown_configuration_keys;
} OCVMProfile;

typedef bool (*OCVMConfigurationBuilder)(void *context);

OCVMProfile OCVMClosedProfile(void);
bool OCVMValidateProfile(const OCVMProfile *profile);
bool OCVMPrepareConfiguration(const OCVMProfile *profile,
                              OCVMConfigurationBuilder build, void *context);

/*
 * OCVMAdmitNative — fail-closed admission gate for native VM dispatch.
 *
 * Returns false until E1 satisfies all native prerequisites on a physical Mac
 * host: resource identity locked through open file descriptors, inherited-
 * capability refusal, effective confinement controls, and sole-owner lifecycle
 * acceptance through the guest's actual stop.  Source tests may assert this
 * returns false; they do not prove confinement or native parity.
 */
bool OCVMAdmitNative(void);

#endif
