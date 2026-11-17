#include "Lifecycle.h"

#include <stddef.h>

static bool valid_failure(OCVMLifecycleFailure failure) {
    return (unsigned)failure <= OC_VM_FAILURE_STOP;
}

static bool valid_state(const OCVMLifecycle *state) {
    if (state == NULL || state->owner == 0 || state->last_ms == 0 ||
        state->deadline_ms == 0 || state->stop_budget_ms == 0 ||
        state->stop_budget_ms > OC_VM_LIFECYCLE_MAX_BUDGET_MS ||
        !valid_failure(state->failure) ||
        (state->stop_pending && !state->stop_issued) ||
        (state->start_pending && state->stop_issued)) {
        return false;
    }
    switch (state->phase) {
        case OC_VM_PREPARED:
        case OC_VM_RUNNING:
            return !state->start_pending && !state->stop_pending && !state->stop_issued;
        case OC_VM_STARTING:
            return state->start_pending && !state->stop_pending && !state->stop_issued;
        case OC_VM_STOPPING:
        case OC_VM_STOP_UNCONFIRMED:
            return true;
        case OC_VM_STOPPED:
            return !state->start_pending && !state->stop_pending;
        default:
            return false;
    }
}

static bool valid_event(const OCVMLifecycle *state, uintptr_t owner,
                        uint64_t now_ms) {
    return valid_state(state) && owner != 0 && owner == state->owner &&
           now_ms != 0 && now_ms >= state->last_ms;
}

/* Call only after event/phase validation. Check arithmetic before any mutation. */
static bool enter_stopping(OCVMLifecycle *state, OCVMLifecycleFailure failure,
                           uint64_t now_ms) {
    if (now_ms > UINT64_MAX - state->stop_budget_ms) {
        return false;
    }
    state->phase = OC_VM_STOPPING;
    state->deadline_ms = now_ms + state->stop_budget_ms;
    state->last_ms = now_ms;
    if (state->failure == OC_VM_FAILURE_NONE) {
        state->failure = failure;
    }
    return true;
}

bool OCVMLifecycleInit(OCVMLifecycle *state, uintptr_t owner, uint64_t now_ms,
                     uint64_t run_budget_ms, uint64_t stop_budget_ms) {
    if (state == NULL || owner == 0 || now_ms == 0 || run_budget_ms == 0 ||
        run_budget_ms > OC_VM_LIFECYCLE_MAX_BUDGET_MS || stop_budget_ms == 0 ||
        stop_budget_ms > OC_VM_LIFECYCLE_MAX_BUDGET_MS ||
        now_ms > UINT64_MAX - run_budget_ms) {
        return false;
    }
    *state = (OCVMLifecycle){
        .owner = owner,
        .phase = OC_VM_PREPARED,
        .failure = OC_VM_FAILURE_NONE,
        .deadline_ms = now_ms + run_budget_ms,
        .stop_budget_ms = stop_budget_ms,
        .last_ms = now_ms,
        .start_pending = false,
        .stop_pending = false,
        .stop_issued = false
    };
    return true;
}

bool OCVMLifecycleBeginStart(OCVMLifecycle *state, uintptr_t owner,
                           uint64_t now_ms) {
    if (!valid_event(state, owner, now_ms) || state->phase != OC_VM_PREPARED ||
        now_ms >= state->deadline_ms) {
        return false;
    }
    state->phase = OC_VM_STARTING;
    state->start_pending = true;
    state->last_ms = now_ms;
    return true;
}

bool OCVMLifecycleDidStart(OCVMLifecycle *state, uintptr_t owner, bool success,
                         uint64_t now_ms) {
    if (!valid_event(state, owner, now_ms) || !state->start_pending) {
        return false;
    }
    if (state->phase == OC_VM_STARTING) {
        if (!success || now_ms >= state->deadline_ms) {
            OCVMLifecycleFailure failure = success ? OC_VM_FAILURE_TIMEOUT : OC_VM_FAILURE_START;
            if (!enter_stopping(state, failure, now_ms)) {
                return false;
            }
        } else {
            state->phase = OC_VM_RUNNING;
        }
    } else if (state->phase != OC_VM_STOPPING && state->phase != OC_VM_STOP_UNCONFIRMED) {
        return false;
    }
    /* Late callbacks drain ownership obligations, but cannot restart a VM. */
    state->start_pending = false;
    state->last_ms = now_ms;
    return true;
}

bool OCVMLifecycleRequestStop(OCVMLifecycle *state, uintptr_t owner,
                            OCVMLifecycleFailure failure, uint64_t now_ms) {
    if (!valid_event(state, owner, now_ms) || !valid_failure(failure)) {
        return false;
    }
    switch (state->phase) {
        case OC_VM_PREPARED:
        case OC_VM_STARTING:
        case OC_VM_RUNNING:
            return enter_stopping(state, failure, now_ms);
        case OC_VM_STOPPING:
        case OC_VM_STOP_UNCONFIRMED:
            if (state->failure == OC_VM_FAILURE_NONE) {
                state->failure = failure;
            }
            state->last_ms = now_ms;
            return true;
        default:
            return false;
    }
}

bool OCVMLifecycleNeedsStop(const OCVMLifecycle *state) {
    return valid_state(state) && state->phase == OC_VM_STOPPING &&
           !state->start_pending && !state->stop_pending && !state->stop_issued;
}

bool OCVMLifecycleBeginStop(OCVMLifecycle *state, uintptr_t owner,
                          uint64_t now_ms) {
    if (!valid_event(state, owner, now_ms) || !OCVMLifecycleNeedsStop(state) ||
        now_ms >= state->deadline_ms) {
        return false;
    }
    state->stop_pending = true;
    state->stop_issued = true;
    state->last_ms = now_ms;
    return true;
}

bool OCVMLifecycleDidStop(OCVMLifecycle *state, uintptr_t owner, bool success,
                        uint64_t now_ms) {
    if (!valid_event(state, owner, now_ms) || !state->stop_pending ||
        (state->phase != OC_VM_STOPPING && state->phase != OC_VM_STOP_UNCONFIRMED)) {
        return false;
    }
    state->stop_pending = false;
    state->last_ms = now_ms;
    if (!success && state->failure == OC_VM_FAILURE_NONE) {
        state->failure = OC_VM_FAILURE_STOP;
    }
    return true;
}

bool OCVMLifecycleObserveStopped(OCVMLifecycle *state, uintptr_t owner,
                               uint64_t now_ms) {
    if (!valid_event(state, owner, now_ms) ||
        (state->phase != OC_VM_STOPPING && state->phase != OC_VM_STOP_UNCONFIRMED) ||
        state->start_pending || state->stop_pending) {
        return false;
    }
    state->phase = OC_VM_STOPPED;
    state->last_ms = now_ms;
    return true;
}

bool OCVMLifecycleTick(OCVMLifecycle *state, uintptr_t owner, uint64_t now_ms) {
    if (!valid_event(state, owner, now_ms)) {
        return false;
    }
    if (now_ms >= state->deadline_ms) {
        switch (state->phase) {
            case OC_VM_PREPARED:
            case OC_VM_STARTING:
            case OC_VM_RUNNING:
                return enter_stopping(state, OC_VM_FAILURE_TIMEOUT, now_ms);
            case OC_VM_STOPPING:
                state->phase = OC_VM_STOP_UNCONFIRMED;
                break;
            default:
                break;
        }
    }
    state->last_ms = now_ms;
    return true;
}

bool OCVMLifecycleCanRelease(const OCVMLifecycle *state) {
    return valid_state(state) && state->phase == OC_VM_STOPPED &&
           !state->start_pending && !state->stop_pending;
}
