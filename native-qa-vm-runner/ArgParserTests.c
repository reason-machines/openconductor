/*
 * ArgParserTests.c — 24 pure-C assertions for OCVMParseArgs.
 *
 * Build & run (no dependencies beyond libc):
 *   cc -std=c11 -Wall -Wextra -Werror \
 *      native-qa-vm-runner/ArgParser.c \
 *      native-qa-vm-runner/ArgParserTests.c \
 *      -o /tmp/arg-parser-tests && /tmp/arg-parser-tests
 */

#include "ArgParser.h"

#include <stdio.h>
#include <string.h>

static int g_pass = 0;
static int g_fail = 0;

static void check(const char *name, int cond) {
    if (cond) {
        ++g_pass;
        printf("PASS %s\n", name);
    } else {
        ++g_fail;
        printf("FAIL %s\n", name);
    }
}

/* ------------------------------------------------------------------ helpers */

static OCVMArgsStatus parse_s(int argc, char *argv[]) {
    OCVMArgs out = {NULL, NULL};
    return OCVMParseArgs(argc, argv, &out);
}

/* ============================================================== test groups */

/* Group 1 — PROBE (argc == 1): 3 checks */
static void g_probe(void) {
    char *argv[] = {"runner"};
    OCVMArgs out = {(void *)1, (void *)1};
    OCVMArgsStatus s = OCVMParseArgs(1, argv, &out);
    check("probe_status",   s == OC_VM_ARGS_PROBE);     /* 1 */
    check("probe_disk_nil", out.disk == NULL);           /* 2 */
    check("probe_aux_nil",  out.aux  == NULL);           /* 3 */
}

/* Group 2 — --disk first, --aux second: 3 checks */
static void g_disk_aux(void) {
    char *argv[] = {"runner", "--disk", "/vm/disk.img", "--aux", "/vm/aux.bin"};
    OCVMArgs out;
    OCVMArgsStatus s = OCVMParseArgs(5, argv, &out);
    check("disk_aux_ok",   s == OC_VM_ARGS_OK);                      /* 4 */
    check("disk_aux_disk", strcmp(out.disk, "/vm/disk.img") == 0);   /* 5 */
    check("disk_aux_aux",  strcmp(out.aux,  "/vm/aux.bin")  == 0);   /* 6 */
}

/* Group 3 — --aux first, --disk second: 3 checks */
static void g_aux_disk(void) {
    char *argv[] = {"runner", "--aux", "/vm/aux.bin", "--disk", "/vm/disk.img"};
    OCVMArgs out;
    OCVMArgsStatus s = OCVMParseArgs(5, argv, &out);
    check("aux_disk_ok",   s == OC_VM_ARGS_OK);                      /* 7 */
    check("aux_disk_disk", strcmp(out.disk, "/vm/disk.img") == 0);   /* 8 */
    check("aux_disk_aux",  strcmp(out.aux,  "/vm/aux.bin")  == 0);   /* 9 */
}

/* Group 4 — missing --disk (only --aux, argc==3): 2 checks */
static void g_missing_disk(void) {
    char *argv[] = {"runner", "--aux", "/vm/aux.bin"};
    OCVMArgsStatus s = parse_s(3, argv);
    check("missing_disk_not_ok",    s != OC_VM_ARGS_OK);    /* 10 */
    check("missing_disk_not_probe", s != OC_VM_ARGS_PROBE); /* 11 */
}

/* Group 5 — missing --aux (only --disk, argc==3): 2 checks */
static void g_missing_aux(void) {
    char *argv[] = {"runner", "--disk", "/vm/disk.img"};
    OCVMArgsStatus s = parse_s(3, argv);
    check("missing_aux_not_ok",    s != OC_VM_ARGS_OK);    /* 12 */
    check("missing_aux_not_probe", s != OC_VM_ARGS_PROBE); /* 13 */
}

/* Group 6 — unknown flag: 2 checks */
static void g_unknown_flag(void) {
    char *argv[] = {"runner", "--disk", "/d", "--unknown", "/u"};
    OCVMArgsStatus s = parse_s(5, argv);
    check("unknown_flag_not_ok",    s != OC_VM_ARGS_OK);    /* 14 */
    check("unknown_flag_not_probe", s != OC_VM_ARGS_PROBE); /* 15 */
}

/* Group 7 — wrong argument count: 2 checks */
static void g_wrong_count(void) {
    /* Extra argument (6 tokens) */
    {
        char *argv[] = {"runner", "--disk", "/d", "--aux", "/a", "extra"};
        OCVMArgsStatus s = parse_s(6, argv);
        check("extra_arg_unknown", s == OC_VM_ARGS_UNKNOWN); /* 16 */
    }
    /* Too few (2 tokens: binary + one flag) */
    {
        char *argv[] = {"runner", "--disk"};
        OCVMArgsStatus s = parse_s(2, argv);
        check("too_few_unknown", s == OC_VM_ARGS_UNKNOWN);   /* 17 */
    }
}

/* Group 8 — empty flag values: 2 checks */
static void g_empty_values(void) {
    {
        char *argv[] = {"runner", "--disk", "", "--aux", "/a"};
        OCVMArgsStatus s = parse_s(5, argv);
        check("empty_disk_missing", s == OC_VM_ARGS_MISSING_DISK); /* 18 */
    }
    {
        char *argv[] = {"runner", "--disk", "/d", "--aux", ""};
        OCVMArgsStatus s = parse_s(5, argv);
        check("empty_aux_missing", s == OC_VM_ARGS_MISSING_AUX);   /* 19 */
    }
}

/* Group 9 — pointer aliasing (returned ptrs alias into argv): 2 checks */
static void g_pointer_aliasing(void) {
    char disk_buf[] = "/vm/disk.img";
    char aux_buf[]  = "/vm/aux.bin";
    char *argv[] = {"runner", "--disk", disk_buf, "--aux", aux_buf};
    OCVMArgs out;
    OCVMParseArgs(5, argv, &out);
    check("alias_disk", out.disk == disk_buf); /* 20 */
    check("alias_aux",  out.aux  == aux_buf);  /* 21 */
}

/* Group 10 — NULL args_out is safe: 1 check */
static void g_null_out(void) {
    char *argv[] = {"runner", "--disk", "/d", "--aux", "/a"};
    OCVMArgsStatus s = OCVMParseArgs(5, argv, NULL);
    check("null_out_ok", s == OC_VM_ARGS_OK); /* 22 */
}

/* Group 11 — paths with spaces in values: 2 checks */
static void g_path_values(void) {
    char *argv[] = {"runner", "--disk", "/volumes/my disk.img",
                               "--aux",  "/volumes/my aux.bin"};
    OCVMArgs out;
    OCVMArgsStatus s = OCVMParseArgs(5, argv, &out);
    check("spaces_ok",   s == OC_VM_ARGS_OK);                               /* 23 */
    check("spaces_disk", strcmp(out.disk, "/volumes/my disk.img") == 0);    /* 24 */
}

/* ================================================================== main */

int main(void) {
    g_probe();
    g_disk_aux();
    g_aux_disk();
    g_missing_disk();
    g_missing_aux();
    g_unknown_flag();
    g_wrong_count();
    g_empty_values();
    g_pointer_aliasing();
    g_null_out();
    g_path_values();

    printf("\n%d passed, %d failed\n", g_pass, g_fail);
    return g_fail == 0 ? 0 : 1;
}
