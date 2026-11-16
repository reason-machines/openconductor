#import <AppKit/AppKit.h>
#import <Virtualization/Virtualization.h>
#import <objc/runtime.h>
#include "ArgParser.h"
#include "Profile.h"
#include "ResourceValidator.h"

static BOOL OCVMReject(NSError **error) {
    if (error != NULL) {
        *error = [NSError errorWithDomain:@"OpenConductor.QAVM" code:1
            userInfo:@{NSLocalizedDescriptionKey: @"Unsupported closed VM configuration"}];
    }
    return NO;
}

static BOOL OCVMAuditConfiguration(VZVirtualMachineConfiguration *config) {
    NSSet<NSString *> *known = [NSSet setWithArray:@[
        @"CPUCount", @"memorySize", @"platform", @"bootLoader", @"graphicsDevices",
        @"keyboards", @"pointingDevices", @"storageDevices", @"audioDevices",
        @"consoleDevices", @"directorySharingDevices", @"entropyDevices",
        @"memoryBalloonDevices", @"networkDevices", @"serialPorts", @"socketDevices",
        @"usbControllers", @"customVirtioDevices", @"label"
    ]];
    unsigned count = 0;
    objc_property_t *properties = class_copyPropertyList(
        VZVirtualMachineConfiguration.class, &count);
    OCVMProfile actual = OCVMClosedProfile();
    for (unsigned i = 0; i < count; ++i) {
        NSString *key = [NSString stringWithUTF8String:property_getName(properties[i])];
        if (![known containsObject:key]) {
            ++actual.unknown_configuration_keys;
        }
    }
    free(properties);
    if (count == 0) {
        return NO;
    }
    actual.memory_bytes = config.memorySize;
    if (config.CPUCount != OC_VM_CPU_COUNT || !OCVMValidateProfile(&actual) ||
        ![config.platform isMemberOfClass:VZMacPlatformConfiguration.class] ||
        ![config.bootLoader isMemberOfClass:VZMacOSBootLoader.class] ||
        config.storageDevices.count != 1 || config.graphicsDevices.count != 1 ||
        config.keyboards.count != 1 || config.pointingDevices.count != 1) {
        return NO;
    }
    VZStorageDeviceConfiguration *disk = config.storageDevices.firstObject;
    VZMacGraphicsDeviceConfiguration *graphics = (id)config.graphicsDevices.firstObject;
    if (![disk isMemberOfClass:VZVirtioBlockDeviceConfiguration.class] ||
        ![graphics isMemberOfClass:VZMacGraphicsDeviceConfiguration.class] ||
        ![config.keyboards.firstObject isMemberOfClass:VZUSBKeyboardConfiguration.class] ||
        ![config.pointingDevices.firstObject
            isMemberOfClass:VZUSBScreenCoordinatePointingDeviceConfiguration.class] ||
        graphics.displays.count != 1) {
        return NO;
    }
    VZMacGraphicsDisplayConfiguration *display = graphics.displays.firstObject;
    if (![display isMemberOfClass:VZMacGraphicsDisplayConfiguration.class] ||
        display.widthInPixels != 1280 || display.heightInPixels != 800 ||
        display.pixelsPerInch != 144) {
        return NO;
    }
    for (NSString *key in @[@"audioDevices", @"consoleDevices",
            @"directorySharingDevices", @"entropyDevices", @"memoryBalloonDevices",
            @"networkDevices", @"serialPorts", @"socketDevices", @"usbControllers",
            @"customVirtioDevices"]) {
        if ([config respondsToSelector:NSSelectorFromString(key)] &&
            [[config valueForKey:key] count] != 0) {
            return NO;
        }
    }
    return ![config respondsToSelector:NSSelectorFromString(@"label")] ||
        [config valueForKey:@"label"] == nil;
}

@interface OCVMConfigurationFactory : NSObject
+ (nullable VZVirtualMachineConfiguration *)prepareProfile:(const OCVMProfile *)profile
    platform:(VZMacPlatformConfiguration *)platform
    disk:(VZDiskImageStorageDeviceAttachment *)disk
    error:(NSError **)error;
@end

typedef struct {
    __unsafe_unretained VZMacPlatformConfiguration *platform;
    __unsafe_unretained VZDiskImageStorageDeviceAttachment *disk;
    __unsafe_unretained VZVirtualMachineConfiguration *configuration;
} OCVMBuildContext;

static bool OCVMConstruct(void *raw) {
    OCVMBuildContext *context = raw;
    VZVirtualMachineConfiguration *config = context->configuration;
    config.CPUCount = OC_VM_CPU_COUNT;
    config.memorySize = OC_VM_MEMORY_BYTES;
    config.platform = [context->platform copy];
    config.bootLoader = [[VZMacOSBootLoader alloc] init];
    config.storageDevices = @[[[VZVirtioBlockDeviceConfiguration alloc]
        initWithAttachment:context->disk]];
    VZMacGraphicsDeviceConfiguration *graphics = [[VZMacGraphicsDeviceConfiguration alloc] init];
    graphics.displays = @[[[VZMacGraphicsDisplayConfiguration alloc]
        initWithWidthInPixels:1280 heightInPixels:800 pixelsPerInch:144]];
    config.graphicsDevices = @[graphics];
    config.keyboards = @[[[VZUSBKeyboardConfiguration alloc] init]];
    config.pointingDevices = @[[[VZUSBScreenCoordinatePointingDeviceConfiguration alloc] init]];
    config.audioDevices = @[];
    config.consoleDevices = @[];
    config.directorySharingDevices = @[];
    config.entropyDevices = @[];
    config.memoryBalloonDevices = @[];
    config.networkDevices = @[];
    config.serialPorts = @[];
    config.socketDevices = @[];
    config.usbControllers = @[];
    return OCVMAuditConfiguration(config);
}

@implementation OCVMConfigurationFactory
+ (VZVirtualMachineConfiguration *)prepareProfile:(const OCVMProfile *)profile
    platform:(VZMacPlatformConfiguration *)platform
    disk:(VZDiskImageStorageDeviceAttachment *)disk
    error:(NSError **)error {
    if (!OCVMValidateProfile(profile) ||
        ![platform isMemberOfClass:VZMacPlatformConfiguration.class] ||
        ![disk isMemberOfClass:VZDiskImageStorageDeviceAttachment.class] ||
        platform.hardwareModel == nil || platform.machineIdentifier == nil ||
        platform.auxiliaryStorage == nil || !platform.hardwareModel.supported) {
        OCVMReject(error);
        return nil;
    }
    VZVirtualMachineConfiguration *config = [VZVirtualMachineConfiguration new];
    OCVMBuildContext context = {platform, disk, config};
    if (!OCVMPrepareConfiguration(profile, OCVMConstruct, &context) ||
        ![config validateWithError:error]) {
        OCVMReject(error);
        return nil;
    }
    return config;
}
@end

static void OCVMUsage(const char *prog) {
    fprintf(stderr,
        "Usage: %s --disk <path> --aux <path>\n"
        "       %s          (probe: no arguments)\n",
        prog, prog);
}

int main(int argc, char *argv[]) {
    if (argc > 1) {
        OCVMArgs args;
        OCVMArgsStatus status = OCVMParseArgs(argc, argv, &args);
        if (status != OC_VM_ARGS_OK) {
            OCVMUsage(argv[0]);
            return (int)status;
        }
        int disk_fd = OCVMValidateResource(args.disk, OC_VM_RES_DISK);
        if (disk_fd < 0) {
            fprintf(stderr, "disk resource validation failed: %s\n", args.disk);
            return 11;
        }
        int aux_fd = OCVMValidateResource(args.aux, OC_VM_RES_AUX);
        if (aux_fd < 0) {
            fprintf(stderr, "aux resource validation failed: %s\n", args.aux);
            OCVMReleaseResourceFd(disk_fd);
            return 12;
        }
        /* Optional hardware identity resources (--hardware-model, --machine-id). */
        int hw_fd = -1;
        if (args.hardware_model != NULL) {
            hw_fd = OCVMValidateResource(args.hardware_model, OC_VM_RES_AUX);
            if (hw_fd < 0) {
                fprintf(stderr, "hardware-model resource validation failed: %s\n",
                        args.hardware_model);
                OCVMReleaseResourceFd(disk_fd);
                OCVMReleaseResourceFd(aux_fd);
                return 13;
            }
        }
        int mid_fd = -1;
        if (args.machine_id != NULL) {
            mid_fd = OCVMValidateResource(args.machine_id, OC_VM_RES_AUX);
            if (mid_fd < 0) {
                fprintf(stderr, "machine-id resource validation failed: %s\n",
                        args.machine_id);
                OCVMReleaseResourceFd(disk_fd);
                OCVMReleaseResourceFd(aux_fd);
                if (hw_fd >= 0) OCVMReleaseResourceFd(hw_fd);
                return 14;
            }
        }
        OCVMReleaseResourceFd(disk_fd);
        OCVMReleaseResourceFd(aux_fd);
        if (hw_fd  >= 0) OCVMReleaseResourceFd(hw_fd);
        if (mid_fd >= 0) OCVMReleaseResourceFd(mid_fd);
    }
    if (!OCVMAdmitNative()) {
        fputs("VM execution is unavailable: resource identity, inherited-capability, "
              "effective-profile and lifecycle acceptance are not implemented.\n", stderr);
        return 78;
    }
    /* Unreachable until E1 satisfies native admission prerequisites. */
    return 78;
}
