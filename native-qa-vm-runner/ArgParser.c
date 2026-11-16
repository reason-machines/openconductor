/*
 * ArgParser.c — CLI argument parser for the native-qa-vm-runner.
 *
 * Pure string processing; no stat/open/syscalls.
 */

#include "ArgParser.h"

#include <string.h>

OCVMArgsStatus OCVMParseArgs(int argc, char *argv[], OCVMArgs *args_out) {
    OCVMArgs out = {NULL, NULL};

    /* Probe: invoked with no arguments. */
    if (argc == 1) {
        if (args_out != NULL) *args_out = out;
        return OC_VM_ARGS_PROBE;
    }

    /* Expect exactly: <prog> --disk <val> --aux <val>  (5 tokens, either order) */
    if (argc != 5) {
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
            if (args_out != NULL) *args_out = out;
            return OC_VM_ARGS_UNKNOWN;
        }

        if (strcmp(flag, "--disk") == 0) {
            out.disk = val;
        } else if (strcmp(flag, "--aux") == 0) {
            out.aux = val;
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
