#include "Lifecycle.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const uintptr_t owner = 42;
static unsigned checks;

static void check(bool condition, const char *expression, int line) {
    ++checks;
    if (!condition) {
        fprintf(stderr, "FAIL line %d: %s\n", line, expression);
        exit(1);
    }
}

#define CHECK(expression) check((expression), #expression, __LINE__)
#define REFUSED(state, expression) do { \
    OCVMLifecycle before; \
    memcpy(&before, &(state), sizeof(before)); \
    CHECK(!(expression)); \
    CHECK(memcmp(&before, &(state), sizeof(before)) == 0); \
} while (0)

static OCVMLifecycle prepared(void) {
    OCVMLifecycle state;
    CHECK(OCVMLifecycleInit(&state, owner, 100, 100, 20));
    CHECK(state.owner == owner && state.phase == OC_VM_PREPARED);
    CHECK(state.failure == OC_VM_FAILURE_NONE && state.deadline_ms == 200);
    CHECK(state.stop_budget_ms == 20 && state.last_ms == 100);
    CHECK(!state.start_pending && !state.stop_pending && !state.stop_issued);
    CHECK(!OCVMLifecycleNeedsStop(&state) && !OCVMLifecycleCanRelease(&state));
    return state;
}

static OCVMLifecycle in_phase(OCVMLifecyclePhase phase) {
    OCVMLifecycle state = prepared();
    if (phase == OC_VM_PREPARED) return state;
    CHECK(OCVMLifecycleBeginStart(&state, owner, 110));
    if (phase == OC_VM_STARTING) return state;
    CHECK(OCVMLifecycleDidStart(&state, owner, true, 120));
    if (phase == OC_VM_RUNNING) return state;
    CHECK(OCVMLifecycleRequestStop(&state, owner,
                                 OC_VM_FAILURE_WORKLOAD_UNSUPPORTED, 130));
    if (phase == OC_VM_STOPPING) return state;
    if (phase == OC_VM_STOP_UNCONFIRMED) {
        CHECK(OCVMLifecycleTick(&state, owner, 150));
    } else {
        CHECK(OCVMLifecycleBeginStop(&state, owner, 131));
        CHECK(OCVMLifecycleDidStop(&state, owner, true, 132));
        CHECK(OCVMLifecycleObserveStopped(&state, owner, 133));
    }
    CHECK(state.phase == phase);
    return state;
}

static void initialization_bounds(void) {
    OCVMLifecycle state;
    memset(&state, 0xA5, sizeof(state));
    REFUSED(state, OCVMLifecycleInit(&state, 0, 100, 100, 20));
    REFUSED(state, OCVMLifecycleInit(&state, owner, 0, 100, 20));
    REFUSED(state, OCVMLifecycleInit(&state, owner, 100, 0, 20));
    REFUSED(state, OCVMLifecycleInit(&state, owner, 100, 100, 0));
    REFUSED(state, OCVMLifecycleInit(&state, owner, 100, 300001, 20));
    REFUSED(state, OCVMLifecycleInit(&state, owner, 100, 100, 300001));
    REFUSED(state, OCVMLifecycleInit(&state, owner, UINT64_MAX, 1, 1));
    REFUSED(state, OCVMLifecycleInit(&state, owner, UINT64_MAX - 9, 10, 1));
    CHECK(!OCVMLifecycleInit(NULL, owner, 100, 100, 20));
    CHECK(OCVMLifecycleInit(&state, owner, 1, 300000, 300000));
    CHECK(state.deadline_ms == 300001);
    CHECK(OCVMLifecycleInit(&state, owner, UINT64_MAX - 1, 1, 1));
    CHECK(state.deadline_ms == UINT64_MAX);
}

static void normal_unsupported_workload(void) {
    OCVMLifecycle state = prepared();
    CHECK(OCVMLifecycleBeginStart(&state, owner, 100));
    CHECK(state.phase == OC_VM_STARTING && state.start_pending);
    CHECK(OCVMLifecycleDidStart(&state, owner, true, 101));
    CHECK(state.phase == OC_VM_RUNNING && !state.start_pending);
    CHECK(!OCVMLifecycleCanRelease(&state));
    CHECK(OCVMLifecycleRequestStop(&state, owner,
                                 OC_VM_FAILURE_WORKLOAD_UNSUPPORTED, 102));
    CHECK(state.phase == OC_VM_STOPPING && state.deadline_ms == 122);
    CHECK(state.failure == OC_VM_FAILURE_WORKLOAD_UNSUPPORTED);
    CHECK(OCVMLifecycleNeedsStop(&state));
    CHECK(OCVMLifecycleBeginStop(&state, owner, 103));
    CHECK(state.stop_pending && state.stop_issued);
    CHECK(!OCVMLifecycleNeedsStop(&state) && !OCVMLifecycleCanRelease(&state));
    REFUSED(state, OCVMLifecycleObserveStopped(&state, owner, 104));
    REFUSED(state, OCVMLifecycleDidStop(&state, owner + 1, true, 104));
    REFUSED(state, OCVMLifecycleDidStop(&state, owner, true, 102));
    CHECK(OCVMLifecycleDidStop(&state, owner, true, 104));
    CHECK(!state.stop_pending && state.phase == OC_VM_STOPPING);
    CHECK(!OCVMLifecycleCanRelease(&state));
    CHECK(OCVMLifecycleObserveStopped(&state, owner, 105));
    CHECK(OCVMLifecycleCanRelease(&state) && state.owner == owner);
    CHECK(state.failure == OC_VM_FAILURE_WORKLOAD_UNSUPPORTED);
    REFUSED(state, OCVMLifecycleObserveStopped(&state, owner, 106));
    REFUSED(state, OCVMLifecycleBeginStart(&state, owner, 106));
    REFUSED(state, OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_NONE, 106));
}

static void start_failure_and_late_callbacks(void) {
    OCVMLifecycle state = in_phase(OC_VM_STARTING);
    CHECK(OCVMLifecycleDidStart(&state, owner, false, 120));
    CHECK(state.phase == OC_VM_STOPPING && state.failure == OC_VM_FAILURE_START);
    CHECK(state.deadline_ms == 140 && !state.start_pending);
    REFUSED(state, OCVMLifecycleDidStart(&state, owner, true, 121));

    for (unsigned unconfirmed = 0; unconfirmed < 2; ++unconfirmed) {
        for (unsigned success = 0; success < 2; ++success) {
            state = in_phase(OC_VM_STARTING);
            CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_GUEST, 120));
            CHECK(!OCVMLifecycleNeedsStop(&state));
            REFUSED(state, OCVMLifecycleBeginStop(&state, owner, 121));
            REFUSED(state, OCVMLifecycleObserveStopped(&state, owner, 121));
            if (unconfirmed) CHECK(OCVMLifecycleTick(&state, owner, 140));
            OCVMLifecyclePhase phase = state.phase;
            uint64_t deadline = state.deadline_ms;
            CHECK(OCVMLifecycleDidStart(&state, owner, success != 0,
                                       unconfirmed ? 141 : 121));
            CHECK(state.phase == phase && state.deadline_ms == deadline);
            CHECK(!state.start_pending && state.failure == OC_VM_FAILURE_GUEST);
            CHECK(!OCVMLifecycleCanRelease(&state));
            REFUSED(state, OCVMLifecycleDidStart(&state, owner, true, 142));
        }
    }
    for (uint64_t now = 200; now <= 201; ++now) {
        state = in_phase(OC_VM_STARTING);
        CHECK(OCVMLifecycleDidStart(&state, owner, true, now));
        CHECK(state.phase == OC_VM_STOPPING && !state.start_pending);
        CHECK(state.failure == OC_VM_FAILURE_TIMEOUT && state.deadline_ms == now + 20);
    }
}

static void timeouts_and_no_extensions(void) {
    for (int phase = OC_VM_PREPARED; phase <= OC_VM_RUNNING; ++phase) {
        OCVMLifecycle state = in_phase((OCVMLifecyclePhase)phase);
        CHECK(OCVMLifecycleTick(&state, owner, 199));
        CHECK(state.phase == (OCVMLifecyclePhase)phase && state.deadline_ms == 200);
        CHECK(OCVMLifecycleTick(&state, owner, 200));
        CHECK(state.phase == OC_VM_STOPPING && state.deadline_ms == 220);
        CHECK(state.failure == OC_VM_FAILURE_TIMEOUT);
        CHECK(state.start_pending == (phase == OC_VM_STARTING));
        CHECK(!OCVMLifecycleCanRelease(&state));
        CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_GUEST, 201));
        CHECK(state.deadline_ms == 220 && state.failure == OC_VM_FAILURE_TIMEOUT);
        CHECK(OCVMLifecycleTick(&state, owner, 219));
        CHECK(state.phase == OC_VM_STOPPING && state.deadline_ms == 220);
        CHECK(OCVMLifecycleTick(&state, owner, 220));
        CHECK(state.phase == OC_VM_STOP_UNCONFIRMED && state.owner == owner);
        CHECK(!OCVMLifecycleNeedsStop(&state) && !OCVMLifecycleCanRelease(&state));
        CHECK(OCVMLifecycleTick(&state, owner, 221));
        CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_NONE, 222));
        CHECK(state.phase == OC_VM_STOP_UNCONFIRMED && state.deadline_ms == 220);
        REFUSED(state, OCVMLifecycleBeginStop(&state, owner, 222));
        if (state.start_pending) {
            REFUSED(state, OCVMLifecycleObserveStopped(&state, owner, 223));
            CHECK(OCVMLifecycleDidStart(&state, owner, true, 223));
        }
        CHECK(OCVMLifecycleObserveStopped(&state, owner, 224));
        CHECK(OCVMLifecycleCanRelease(&state));
    }
    OCVMLifecycle state = prepared();
    REFUSED(state, OCVMLifecycleBeginStart(&state, owner, 200));
    REFUSED(state, OCVMLifecycleBeginStart(&state, owner, 201));
    state = in_phase(OC_VM_STOPPING);
    CHECK(OCVMLifecycleNeedsStop(&state));
    REFUSED(state, OCVMLifecycleBeginStop(&state, owner, 150));
    REFUSED(state, OCVMLifecycleBeginStop(&state, owner, 151));
    CHECK(OCVMLifecycleTick(&state, owner, 150));
    CHECK(state.phase == OC_VM_STOP_UNCONFIRMED && !OCVMLifecycleCanRelease(&state));
}

static void stop_failure_and_no_retries(void) {
    for (unsigned success = 0; success < 2; ++success) {
        for (unsigned unconfirmed = 0; unconfirmed < 2; ++unconfirmed) {
            OCVMLifecycle state = prepared();
            CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_NONE, 110));
            CHECK(OCVMLifecycleBeginStop(&state, owner, 111));
            REFUSED(state, OCVMLifecycleBeginStop(&state, owner, 112));
            if (unconfirmed) CHECK(OCVMLifecycleTick(&state, owner, 130));
            CHECK(OCVMLifecycleDidStop(&state, owner, success != 0,
                                      unconfirmed ? 131 : 112));
            CHECK(state.failure == (success ? OC_VM_FAILURE_NONE : OC_VM_FAILURE_STOP));
            CHECK(state.stop_issued && !state.stop_pending);
            CHECK(state.phase == (unconfirmed ? OC_VM_STOP_UNCONFIRMED : OC_VM_STOPPING));
            CHECK(!OCVMLifecycleNeedsStop(&state) && !OCVMLifecycleCanRelease(&state));
            REFUSED(state, OCVMLifecycleDidStop(&state, owner, true, 132));
            REFUSED(state, OCVMLifecycleBeginStop(&state, owner, 132));
            CHECK(OCVMLifecycleObserveStopped(&state, owner, 133));
            CHECK(OCVMLifecycleCanRelease(&state));
        }
    }
    OCVMLifecycle state = in_phase(OC_VM_STOPPING);
    CHECK(OCVMLifecycleBeginStop(&state, owner, 131));
    CHECK(OCVMLifecycleDidStop(&state, owner, false, 132));
    CHECK(state.failure == OC_VM_FAILURE_WORKLOAD_UNSUPPORTED);
    state = prepared();
    CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_NONE, 110));
    CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_GUEST, 111));
    CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_START, 112));
    CHECK(state.failure == OC_VM_FAILURE_GUEST && state.deadline_ms == 130);
}

static void rejected_events(OCVMLifecycle *value, uintptr_t actor, uint64_t now) {
    OCVMLifecycle state = *value;
    REFUSED(state, OCVMLifecycleBeginStart(&state, actor, now));
    REFUSED(state, OCVMLifecycleDidStart(&state, actor, true, now));
    REFUSED(state, OCVMLifecycleDidStart(&state, actor, false, now));
    REFUSED(state, OCVMLifecycleRequestStop(&state, actor, OC_VM_FAILURE_GUEST, now));
    REFUSED(state, OCVMLifecycleBeginStop(&state, actor, now));
    REFUSED(state, OCVMLifecycleDidStop(&state, actor, true, now));
    REFUSED(state, OCVMLifecycleDidStop(&state, actor, false, now));
    REFUSED(state, OCVMLifecycleObserveStopped(&state, actor, now));
    REFUSED(state, OCVMLifecycleTick(&state, actor, now));
}

static void owner_clock_and_null_guards(void) {
    for (int phase = OC_VM_PREPARED; phase <= OC_VM_STOPPED; ++phase) {
        OCVMLifecycle state = in_phase((OCVMLifecyclePhase)phase);
        rejected_events(&state, owner + 1, state.last_ms);
        rejected_events(&state, 0, state.last_ms);
        rejected_events(&state, owner, state.last_ms - 1);
        rejected_events(&state, owner, 0);
        REFUSED(state, OCVMLifecycleRequestStop(&state, owner,
                                              (OCVMLifecycleFailure)-1, state.last_ms));
        REFUSED(state, OCVMLifecycleRequestStop(&state, owner,
                                              (OCVMLifecycleFailure)999, state.last_ms));
    }
    CHECK(!OCVMLifecycleBeginStart(NULL, owner, 1));
    CHECK(!OCVMLifecycleDidStart(NULL, owner, true, 1));
    CHECK(!OCVMLifecycleRequestStop(NULL, owner, OC_VM_FAILURE_NONE, 1));
    CHECK(!OCVMLifecycleNeedsStop(NULL));
    CHECK(!OCVMLifecycleBeginStop(NULL, owner, 1));
    CHECK(!OCVMLifecycleDidStop(NULL, owner, true, 1));
    CHECK(!OCVMLifecycleObserveStopped(NULL, owner, 1));
    CHECK(!OCVMLifecycleTick(NULL, owner, 1));
    CHECK(!OCVMLifecycleCanRelease(NULL));
}

static void invalid_phases_and_callbacks(void) {
    OCVMLifecycle state = prepared();
    REFUSED(state, OCVMLifecycleDidStart(&state, owner, true, 101));
    REFUSED(state, OCVMLifecycleBeginStop(&state, owner, 101));
    REFUSED(state, OCVMLifecycleDidStop(&state, owner, true, 101));
    REFUSED(state, OCVMLifecycleObserveStopped(&state, owner, 101));
    CHECK(OCVMLifecycleBeginStart(&state, owner, 101));
    REFUSED(state, OCVMLifecycleBeginStart(&state, owner, 102));
    CHECK(OCVMLifecycleDidStart(&state, owner, true, 102));
    REFUSED(state, OCVMLifecycleDidStart(&state, owner, false, 103));
    REFUSED(state, OCVMLifecycleObserveStopped(&state, owner, 103));
    CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_GUEST, 103));
    REFUSED(state, OCVMLifecycleDidStop(&state, owner, true, 104));
    REFUSED(state, OCVMLifecycleBeginStart(&state, owner, 104));
    CHECK(OCVMLifecycleObserveStopped(&state, owner, 104));
    CHECK(OCVMLifecycleCanRelease(&state));
    CHECK(OCVMLifecycleTick(&state, owner, 105));
    CHECK(state.phase == OC_VM_STOPPED && OCVMLifecycleCanRelease(&state));
}

static void malformed_states_are_not_releasable(void) {
    OCVMLifecycle state = {0};
    rejected_events(&state, owner, 100);
    CHECK(!OCVMLifecycleNeedsStop(&state) && !OCVMLifecycleCanRelease(&state));
    for (unsigned field = 0; field < 8; ++field) {
        state = in_phase(OC_VM_STOPPED);
        switch (field) {
            case 0: state.owner = 0; break;
            case 1: state.last_ms = 0; break;
            case 2: state.deadline_ms = 0; break;
            case 3: state.stop_budget_ms = 0; break;
            case 4: state.stop_budget_ms = 300001; break;
            case 5: state.phase = (OCVMLifecyclePhase)999; break;
            case 6: state.failure = (OCVMLifecycleFailure)999; break;
            case 7: state.start_pending = true; break;
        }
        CHECK(!OCVMLifecycleNeedsStop(&state) && !OCVMLifecycleCanRelease(&state));
        rejected_events(&state, owner, 200);
    }
    state = in_phase(OC_VM_STOPPING);
    state.stop_pending = true;
    rejected_events(&state, owner, 200);
    CHECK(!OCVMLifecycleNeedsStop(&state));
}

static void overflow_retains_ownership(void) {
    OCVMLifecycle state;
    CHECK(OCVMLifecycleInit(&state, owner, UINT64_MAX - 100, 50, 20));
    REFUSED(state, OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_GUEST,
                                          UINT64_MAX - 19));
    REFUSED(state, OCVMLifecycleTick(&state, owner, UINT64_MAX - 19));
    CHECK(state.owner == owner && !OCVMLifecycleCanRelease(&state));
    CHECK(OCVMLifecycleBeginStart(&state, owner, UINT64_MAX - 99));
    REFUSED(state, OCVMLifecycleDidStart(&state, owner, false, UINT64_MAX - 19));
    REFUSED(state, OCVMLifecycleDidStart(&state, owner, true, UINT64_MAX - 19));
    REFUSED(state, OCVMLifecycleTick(&state, owner, UINT64_MAX - 19));
    CHECK(state.start_pending && !OCVMLifecycleCanRelease(&state));
    CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_GUEST,
                                 UINT64_MAX - 20));
    CHECK(state.deadline_ms == UINT64_MAX);
    CHECK(OCVMLifecycleDidStart(&state, owner, true, UINT64_MAX - 19));
    CHECK(OCVMLifecycleBeginStop(&state, owner, UINT64_MAX - 18));
    CHECK(OCVMLifecycleRequestStop(&state, owner, OC_VM_FAILURE_STOP, UINT64_MAX));
    CHECK(state.deadline_ms == UINT64_MAX && state.failure == OC_VM_FAILURE_GUEST);
    CHECK(OCVMLifecycleTick(&state, owner, UINT64_MAX));
    CHECK(state.phase == OC_VM_STOP_UNCONFIRMED && !OCVMLifecycleCanRelease(&state));
    CHECK(OCVMLifecycleDidStop(&state, owner, true, UINT64_MAX));
    CHECK(OCVMLifecycleObserveStopped(&state, owner, UINT64_MAX));
    CHECK(OCVMLifecycleCanRelease(&state));
}

int main(void) {
    initialization_bounds();
    normal_unsupported_workload();
    start_failure_and_late_callbacks();
    timeouts_and_no_extensions();
    stop_failure_and_no_retries();
    owner_clock_and_null_guards();
    invalid_phases_and_callbacks();
    malformed_states_are_not_releasable();
    overflow_retains_ownership();
    printf("PASS: %u lifecycle checks; owner/clock guards, bounded stop, callbacks, observed release\n",
           checks);
    return 0;
}
