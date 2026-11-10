#import <AppKit/AppKit.h>
#import <Virtualization/Virtualization.h>
#import <objc/runtime.h>
#include "Profile.h"

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
    config.bootLoader = [VZMacOSBootLoader new];
    config.storageDevices = @[[[VZVirtioBlockDeviceConfiguration alloc]
        initWithAttachment:context->disk]];
    VZMacGraphicsDeviceConfiguration *graphics = [VZMacGraphicsDeviceConfiguration new];
    graphics.displays = @[[[VZMacGraphicsDisplayConfiguration alloc]
        initWithWidthInPixels:1280 heightInPixels:800 pixelsPerInch:144]];
    config.graphicsDevices = @[graphics];
    config.keyboards = @[[VZUSBKeyboardConfiguration new]];
    config.pointingDevices = @[[VZUSBScreenCoordinatePointingDeviceConfiguration new]];
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

int main(void) {
    fputs("VM execution is unavailable: resource identity, inherited-capability, "
          "effective-profile and lifecycle acceptance are not implemented.\n", stderr);
    return 78;
}
