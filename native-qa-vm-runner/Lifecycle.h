#ifndef OC_QA_VM_LIFECYCLE_H
#define OC_QA_VM_LIFECYCLE_H

#include <stdbool.h>
#include <stdint.h>

#define OC_VM_LIFECYCLE_MAX_BUDGET_MS UINT64_C(300000)

typedef enum OCVMLifecyclePhase {
    OC_VM_PREPARED,
    OC_VM_STARTING,
    OC_VM_RUNNING,
    OC_VM_STOPPING,
    OC_VM_STOP_UNCONFIRMED,
    OC_VM_STOPPED
} OCVMLifecyclePhase;

typedef enum OCVMLifecycleFailure {
    OC_VM_FAILURE_NONE,
    OC_VM_FAILURE_WORKLOAD_UNSUPPORTED,
    OC_VM_FAILURE_START,
    OC_VM_FAILURE_GUEST,
    OC_VM_FAILURE_TIMEOUT,
    OC_VM_FAILURE_STOP
} OCVMLifecycleFailure;

typedef struct OCVMLifecycle {
    uintptr_t owner;
    OCVMLifecyclePhase phase;
    OCVMLifecycleFailure failure;
    uint64_t deadline_ms;
    uint64_t stop_budget_ms;
    uint64_t last_ms;
    bool start_pending;
    bool stop_pending;
    bool stop_issued;
} OCVMLifecycle;

/*
 * Pure, serialized state transitions, not a VM controller or admission gate.
 * Init is for fresh storage only; do not reinitialize an owned lifecycle.
 * Each event requires the same nonzero owner and a positive, nondecreasing
 * clock. Invalid events (including deadline overflow) leave state unchanged.
 */
bool OCVMLifecycleInit(OCVMLifecycle *state, uintptr_t owner, uint64_t now_ms,
                     uint64_t run_budget_ms, uint64_t stop_budget_ms);
bool OCVMLifecycleBeginStart(OCVMLifecycle *state, uintptr_t owner,
                           uint64_t now_ms);
/* A successful completion at/after the run deadline enters TIMEOUT stopping. */
bool OCVMLifecycleDidStart(OCVMLifecycle *state, uintptr_t owner, bool success,
                         uint64_t now_ms);
bool OCVMLifecycleRequestStop(OCVMLifecycle *state, uintptr_t owner,
                            OCVMLifecycleFailure failure, uint64_t now_ms);
/* Structural eligibility only: the adapter must tick/check its clock first. */
bool OCVMLifecycleNeedsStop(const OCVMLifecycle *state);
/* Refuses dispatch at or after the existing stop deadline. Never retries. */
bool OCVMLifecycleBeginStop(OCVMLifecycle *state, uintptr_t owner,
                          uint64_t now_ms);
bool OCVMLifecycleDidStop(OCVMLifecycle *state, uintptr_t owner, bool success,
                        uint64_t now_ms);
/* The adapter must observe this exact owner's VM stopped, not just a callback. */
bool OCVMLifecycleObserveStopped(OCVMLifecycle *state, uintptr_t owner,
                               uint64_t now_ms);
bool OCVMLifecycleTick(OCVMLifecycle *state, uintptr_t owner, uint64_t now_ms);
bool OCVMLifecycleCanRelease(const OCVMLifecycle *state);

#endif
