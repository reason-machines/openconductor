#import <AppKit/AppKit.h>
#import <Virtualization/Virtualization.h>
#import <objc/runtime.h>
#include "ArgParser.h"
#include "Profile.h"
#include "HeldResources.h"
#include "Lifecycle.h"
#include <errno.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>

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

/* No socket, network, console, share, disk-result reader, or guest agent is added.
 * A workload/result protocol needs a separate reviewed profile and binding.
 * Neither native admission nor this boundary has a CLI/environment override.
 */
static BOOL OCVMWorkloadChannelAvailable(void) { return NO; }

static uint64_t OCVMNow(void) {
    struct timespec value;
    if (clock_gettime(CLOCK_MONOTONIC, &value) != 0 || value.tv_sec < 0 ||
        (uint64_t)value.tv_sec > (UINT64_MAX - 999) / 1000) return 0;
    return (uint64_t)value.tv_sec * 1000 + (uint64_t)value.tv_nsec / 1000000;
}

static NSData *OCVMReadIdentity(int fd) {
    struct stat identity;
    if (fstat(fd, &identity) != 0 || identity.st_size < 1 ||
        identity.st_size > 1024 * 1024) return nil;
    NSMutableData *data = [NSMutableData dataWithLength:(NSUInteger)identity.st_size];
    size_t offset = 0;
    while (offset < data.length) {
        ssize_t count = pread(fd, (char *)data.mutableBytes + offset,
            data.length - offset, (off_t)offset);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return nil;
        offset += (size_t)count;
    }
    return data;
}

/* One invocation owns the validated FDs, configuration, VM and all callbacks.
 * All VZ operations and state transitions use the main serial queue.
 */
@interface OCVMOwnedInvocation : NSObject <VZVirtualMachineDelegate> {
    OCVMHeldResources _resources;
    OCVMLifecycle _lifecycle;
    VZVirtualMachine *_vm;
    BOOL _startDispatched;
}
+ (int)runWithArgs:(const OCVMArgs *)args;
- (BOOL)prepareWithArgs:(const OCVMArgs *)args;
- (void)beginStart;
- (void)drive;
- (void)unconfirmedStop;
@end

@implementation OCVMOwnedInvocation
- (instancetype)init {
    self = [super init];
    if (self) OCVMInitResources(&_resources);
    return self;
}

- (void)dealloc { OCVMReleaseResources(&_resources); }

- (BOOL)prepareWithArgs:(const OCVMArgs *)args {
    if (OCVMHoldResources(args, &_resources) != 0) return NO;
    NSData *hardware = OCVMReadIdentity(_resources.fds[2]);
    NSData *identifier = OCVMReadIdentity(_resources.fds[3]);
    if (hardware == nil || identifier == nil || !OCVMResourcesMatch(&_resources)) return NO;
    VZMacPlatformConfiguration *platform = [VZMacPlatformConfiguration new];
    platform.hardwareModel = [[VZMacHardwareModel alloc] initWithDataRepresentation:hardware];
    platform.machineIdentifier = [[VZMacMachineIdentifier alloc] initWithDataRepresentation:identifier];
    if (platform.hardwareModel == nil || platform.machineIdentifier == nil) return NO;
    /* VZ uses URLs, not the held FDs. Before/after snapshots detect observed
     * mutations only; atomic identity-through-use remains an admission blocker.
     */
    NSURL *aux = [NSURL fileURLWithPath:@(args->aux)];
    NSURL *disk = [NSURL fileURLWithPath:@(args->disk)];
    platform.auxiliaryStorage = [[VZMacAuxiliaryStorage alloc] initWithURL:aux];
    NSError *error = nil;
    VZDiskImageStorageDeviceAttachment *attachment = [[VZDiskImageStorageDeviceAttachment alloc]
        initWithURL:disk readOnly:NO error:&error];
    if (attachment == nil || !OCVMResourcesMatch(&_resources)) return NO;
    OCVMProfile profile = OCVMClosedProfile();
    VZVirtualMachineConfiguration *configuration = [OCVMConfigurationFactory prepareProfile:&profile
        platform:platform disk:attachment error:&error];
    if (configuration == nil || !OCVMResourcesMatch(&_resources)) return NO;
    _vm = [[VZVirtualMachine alloc]
        initWithConfiguration:configuration queue:dispatch_get_main_queue()];
    _vm.delegate = self;
    return _vm != nil && OCVMLifecycleInit(&_lifecycle, (uintptr_t)(__bridge void *)_vm,
        OCVMNow(), 60000, 10000);
}

- (void)unconfirmedStop {
    fputs("{\"native_admission\":false,\"same_vm_stopped\":false,"
          "\"error\":\"VM stop unconfirmed; invocation failed\"}\n", stderr);
    fflush(stderr);
    /* Never unwind the owner as though stop were confirmed. Process failure is
     * bounded, but process exit is NOT evidence that VZ stopped the guest.
     */
    _Exit(75);
}

- (void)beginStart {
    uintptr_t owner = (uintptr_t)(__bridge void *)_vm;
    if (!OCVMLifecycleBeginStart(&_lifecycle, owner, OCVMNow())) [self unconfirmedStop];
    if (!_vm.canStart) {
        if (!OCVMLifecycleDidStart(&_lifecycle, owner, false, OCVMNow())) [self unconfirmedStop];
        return;
    }
    VZVirtualMachine *ownedVM = _vm;
    _startDispatched = YES;
    [ownedVM startWithCompletionHandler:^(NSError *error) {
        if (ownedVM != self->_vm || !OCVMLifecycleDidStart(&self->_lifecycle,
                (uintptr_t)(__bridge void *)ownedVM, error == nil, OCVMNow())) {
            [self unconfirmedStop];
        }
        /* No guest result can currently be obtained, including on successful boot. */
        if (!OCVMLifecycleRequestStop(&self->_lifecycle, owner,
                OC_VM_FAILURE_WORKLOAD_UNSUPPORTED, OCVMNow())) [self unconfirmedStop];
        [self drive];
    }];
}

- (void)drive {
    uintptr_t owner = (uintptr_t)(__bridge void *)_vm;
    if (!OCVMLifecycleTick(&_lifecycle, owner, OCVMNow())) [self unconfirmedStop];
    if (_vm.state == VZVirtualMachineStateStopped &&
        !_lifecycle.start_pending && !_lifecycle.stop_pending) {
        if (!OCVMLifecycleObserveStopped(&_lifecycle, owner, OCVMNow())) [self unconfirmedStop];
        return;
    }
    if (_lifecycle.phase == OC_VM_STOP_UNCONFIRMED) [self unconfirmedStop];
    if (OCVMLifecycleNeedsStop(&_lifecycle) && _vm.canStop) {
        if (!OCVMLifecycleBeginStop(&_lifecycle, owner, OCVMNow())) [self unconfirmedStop];
        VZVirtualMachine *ownedVM = _vm;
        [ownedVM stopWithCompletionHandler:^(NSError *error) {
            if (ownedVM != self->_vm || !OCVMLifecycleDidStop(&self->_lifecycle,
                    (uintptr_t)(__bridge void *)ownedVM, error == nil, OCVMNow())) {
                [self unconfirmedStop];
            }
            /* Completion alone is not a stopped observation. */
            [self drive];
        }];
    }
}

- (void)guestDidStopVirtualMachine:(VZVirtualMachine *)virtualMachine {
    [self virtualMachine:virtualMachine didStopWithError:nil];
}

- (void)virtualMachine:(VZVirtualMachine *)virtualMachine didStopWithError:(NSError *)error {
    (void)error;
    if (virtualMachine != _vm || !OCVMLifecycleRequestStop(&_lifecycle,
            (uintptr_t)(__bridge void *)virtualMachine, OC_VM_FAILURE_GUEST, OCVMNow())) {
        [self unconfirmedStop];
    }
    [self drive];
}

+ (int)runWithArgs:(const OCVMArgs *)args {
    OCVMOwnedInvocation *invocation = [OCVMOwnedInvocation new];
    if (![invocation prepareWithArgs:args]) {
        fputs("VM preparation refused; native admission remains false.\n", stderr);
        return 78;
    }
    if (!OCVMWorkloadChannelAvailable()) {
        if (!OCVMLifecycleRequestStop(&invocation->_lifecycle,
                (uintptr_t)(__bridge void *)invocation->_vm,
                OC_VM_FAILURE_WORKLOAD_UNSUPPORTED, OCVMNow())) [invocation unconfirmedStop];
    } else {
        [invocation beginStart];
    }
    while (!OCVMLifecycleCanRelease(&invocation->_lifecycle)) {
        [invocation drive];
        if (!OCVMLifecycleCanRelease(&invocation->_lifecycle)) {
            @autoreleasepool {
                [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                    beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.01]];
            }
        }
    }
    fprintf(stderr, "{\"native_admission\":false,\"same_vm_stopped\":true,"
        "\"vm_start_dispatched\":%s,\"workload_result\":false,\"failure\":%u}\n",
        invocation->_startDispatched ? "true" : "false", (unsigned)invocation->_lifecycle.failure);
    return 78; /* Lifecycle observation is never workload success or native admission. */
}
@end

static void OCVMUsage(const char *prog) {
    fprintf(stderr,
        "Usage: %s --disk <path> --aux <path> --hardware-model <path> --machine-id <path>\n"
        "       %s          (probe: no arguments)\n", prog, prog);
}

int main(int argc, char *argv[]) {
    @autoreleasepool {
        OCVMArgs args;
        OCVMArgsStatus status = OCVMParseArgs(argc, argv, &args);
        if (status != OC_VM_ARGS_OK && status != OC_VM_ARGS_PROBE) {
            OCVMUsage(argv[0]);
            return (int)status;
        }
        /* Closed BEFORE opening guest files, constructing a VM or scheduling callbacks. */
        if (!OCVMAdmitNative()) {
            fputs("VM execution unavailable: atomic resource use, inherited-capability, "
                  "effective confinement and native lifecycle acceptance remain unverified; "
                  "workload/result channel unsupported.\n", stderr);
            return 78;
        }
        if (status == OC_VM_ARGS_PROBE) return 78;
        return [OCVMOwnedInvocation runWithArgs:&args];
    }
}
