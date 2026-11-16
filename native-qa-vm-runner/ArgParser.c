/*
 * ArgParser.c — CLI argument parser for the native-qa-vm-runner.
 *
 * Pure string processing; no stat/open/syscalls.
 *
 * Accepted forms:
 *   argc == 1  : probe (no arguments)
 *   argc == 5  : --disk <val> --aux <val>  (any order)
 *   argc == 9  : --disk <val> --aux <val> --hardware-model <val> --machine-id <val>
 *                (any order)
 *
 * --hardware-model and --machine-id are optional; when absent, the
 * corresponding OCVMArgs fields are left NULL.
 */

#include "ArgParser.h"

#include <string.h>

OCVMArgsStatus OCVMParseArgs(int argc, char *argv[], OCVMArgs *args_out) {
    OCVMArgs out = {NULL, NULL, NULL, NULL};

    /* Probe: invoked with no arguments. */
    if (argc == 1) {
        if (args_out != NULL) *args_out = out;
        return OC_VM_ARGS_PROBE;
    }

    /* Accept exactly 5 (disk+aux) or 9 (disk+aux+hardware-model+machine-id) tokens. */
    if (argc != 5 && argc != 9) {
        if (args_out != NULL) *args_out = out;
        return OC_VM_ARGS_UNKNOWN;
    }

    for (int i = 1; i < argc - 1; i += 2) {
        const char *flag = argv[i];
        const char *val  = argv[i + 1];

        if (val[0] == '\0') {
            /* Empty value is an error; decide which flag it belongs to. */
            if (strcmp(flag, "--disk") == 0) {
                if (args_out != NULL) *args_out = out;
                return OC_VM_ARGS_MISSING_DISK;
            }
            if (strcmp(flag, "--aux") == 0) {
                if (args_out != NULL) *args_out = out;
                return OC_VM_ARGS_MISSING_AUX;
            }
            if (strcmp(flag, "--hardware-model") == 0) {
                if (args_out != NULL) *args_out = out;
                return OC_VM_ARGS_MISSING_HARDWARE_MODEL;
            }
            if (strcmp(flag, "--machine-id") == 0) {
                if (args_out != NULL) *args_out = out;
                return OC_VM_ARGS_MISSING_MACHINE_ID;
            }
            if (args_out != NULL) *args_out = out;
            return OC_VM_ARGS_UNKNOWN;
        }

        if (strcmp(flag, "--disk") == 0) {
            out.disk = val;
        } else if (strcmp(flag, "--aux") == 0) {
            out.aux = val;
        } else if (strcmp(flag, "--hardware-model") == 0) {
            out.hardware_model = val;
        } else if (strcmp(flag, "--machine-id") == 0) {
            out.machine_id = val;
        } else {
            if (args_out != NULL) *args_out = out;
            return OC_VM_ARGS_UNKNOWN;
        }
    }

    if (out.disk == NULL) {
        if (args_out != NULL) *args_out = out;
        return OC_VM_ARGS_MISSING_DISK;
    }
    if (out.aux == NULL) {
        if (args_out != NULL) *args_out = out;
        return OC_VM_ARGS_MISSING_AUX;
    }

    if (args_out != NULL) *args_out = out;
    return OC_VM_ARGS_OK;
}
