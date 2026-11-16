/*
 * ArgParser.h — CLI argument parser for the native-qa-vm-runner.
 *
 * Parses --disk <path> --aux <path> from argv.  No filesystem operations are
 * performed; returned pointers alias directly into the caller's argv array and
 * are not owned by OCVMArgs.
 */

#pragma once

#include <stddef.h>

typedef enum {
    OC_VM_ARGS_OK           = 0,  /* --disk and --aux both present and non-empty */
    OC_VM_ARGS_PROBE        = 1,  /* argc == 1; capability probe, no arguments */
    OC_VM_ARGS_MISSING_DISK = 2,  /* --disk absent or value missing */
    OC_VM_ARGS_MISSING_AUX  = 3,  /* --aux absent or value missing */
    OC_VM_ARGS_UNKNOWN      = 4,  /* unrecognised flag or wrong argument count */
} OCVMArgsStatus;

typedef struct {
    const char *disk; /* alias into argv; not owned */
    const char *aux;  /* alias into argv; not owned */
} OCVMArgs;

/*
 * OCVMParseArgs — parse (argc, argv) into *args_out.
 *
 * Returns OC_VM_ARGS_PROBE when argc == 1 (the binary was invoked with no
 * arguments; *args_out is left zeroed).  Returns OC_VM_ARGS_OK and fills
 * args_out->disk / args_out->aux on success.  Returns an error status and
 * leaves *args_out zeroed on any parse failure.
 *
 * No filesystem operations are performed.
 */
OCVMArgsStatus OCVMParseArgs(int argc, char *argv[], OCVMArgs *args_out);
