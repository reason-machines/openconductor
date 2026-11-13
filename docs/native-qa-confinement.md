# Native QA process-family confinement

The four Python native QA launch sites use one fail-closed runner. This change
does not authorize a native run and does not establish whole-app isolation.
`native_qa_cache.require_filesystem_isolation` still refuses every receipt.
OpenConductor, WebKit, providers, and existing user state are outside the hosted
sentinel test. Native QA operations still require the sole coordinated native
executor's separately authorized unit.

## Runner contract

`native_qa_runner.run_probe(LaunchSpec(...))` accepts one of five fixed probes.
`Probe` owns its arguments and maximum timeout. Only storage probes accept a
32-character hexadecimal synthetic fixture token. Callers cannot supply an
environment, arbitrary arguments, inherited descriptors, or `Popen` options.

The runner validates an owned canonical mode-0700 root and an owned canonical
executable staged inside its read-only code area. Every launch, including
relaunch, rejects symlinks, regular files with multiple hard links, unowned
objects, and special filesystem objects. Traversal errors abort validation.
The root and every parent component of the executable and three mutable files
are independently checked with `lstat`, even if traversal never reaches them.
These paths must be directories owned by the effective UID, not symlinks. The
executable and all three precreated mutable files must independently be owned
regular files with one hard link. Mutable files must have mode 0600. Directory
link counts are not constrained: Linux and APFS directory counts do not obey the
regular-file single-link invariant.

The staging layout contains only a copied app bundle or the synthetic sentinel,
QA configuration, and the fixed data files. A Cargo target tree belongs outside
the root. An executable in an ambient build directory is not an acceptable
substitute for the copied executable inside the root. This layout description
does not authorize a bundle build, copy, or launch. The existing prepare command
does not populate the synthetic fixed files; launch validation refuses an
incomplete stage.

Staging must be fresh, trusted, and quiescent. These checks are not a defense
against a concurrent same-UID external mutator.

Only `/usr/bin/sandbox-exec` on macOS is supported. Its deprecated status is an
explicit portability risk. Missing transport, unsupported platforms, policy
parse errors, unsuccessful exec, and nonzero child exits never trigger an
unconfined retry. Callers inspect the returned status before parsing a receipt.
Timeouts raise and clean up the owned process group.

The result includes PID, return code, stdout, stderr, policy version, the
SHA-256 of the requested policy, and the concrete path parameters passed with
`-D`. Receipts retain that policy identity. A hash identifies the requested
policy, not proof that every helper was confined.

## Policy boundary

The policy starts with `deny default` and imports no base profile. Paths reach
`sandbox-exec` through `-D` parameters, never interpolated policy text. Fork is
allowed separately from exec, which is restricted to the exact staged
executable. Read and executable mapping permissions cover staged code and the
specified system library trees. The combined exact `file-read-data` and
`file-read-metadata` grant on the literal root node `/` correlated with successful
sentinel startup after an earlier pre-observation abort. That comparison alone
does not prove the dynamic loader mechanism or which operation is necessary.
The hosted suite includes one metadata-only subtraction comparison and records
its policy hash, status, output, and startup marker separately. A failed startup
is not denial evidence.

The literal-root data grant permits listing names immediately in `/`. It is not
a `/` subtree permission and does not grant content reads under those names.
The production sentinel separately requires denied outside-content reads and
writes. There are no Mach, XPC, or network allow rules. No network or service
lookup is exercised by the sentinel.

Code, configuration, and directory entries remain read-only. Only
`file-write-data` on these exact precreated synthetic files is permitted:

- `data/confinement-state`.
- `tmp/confinement-startup`.
- `tmp/confinement-child`.

No directory subtree is writable. Creation, linking, and renaming have no allow
rule. A normal application or WebKit process that needs more authority is
expected to fail closed. This policy must not be loosened to make it start.

The runner closes ambient file descriptors, disconnects stdin, captures output,
filters the environment through the existing QA environment contract, and
creates a dedicated process group. Group cleanup is not proof against detached
`setsid` descendants or broker-launched processes. `close_fds` does not close Mach
ports, and denying lookup does not revoke existing Mach rights. The host sandbox
cannot retroactively remove already acquired authority. Full-app, WebKit, XPC,
broker, existing-service, and preexisting-authority coverage remain unsupported.

A VM is the longer-term alternative for whole-app testing. It is not implemented
here. An authorized bootable guest, self-starting guest probe, and trusted result
observation are missing; host VM validate/start calls alone do not run a guest
probe.

## Evidence scopes

Portable tests mock only the OS transport to run synthetic Python receipt
fixtures. They cover launch routing, validation, status handling, descriptor
closure, timeouts, and the unconditional admission refusal. They are not native
confinement proof.

The dedicated automatic workflow runs on a fresh `macos-latest` worker without
secrets or OpenConductor builds. It compiles the C source embedded in
`tools/test_native_qa_runner.py` into a temporary root. It records macOS version,
kernel build, architecture, policy version and hash, and sentinel hash. It does
not skip a missing backend, compilation failure, or production policy error on
that job. Its gate requires exactly four completed native tests with no skips;
wrong collection counts and a skipped class fail the job. The metadata-only
startup comparison may report a pre-observation abort, not enforcement success.

The unconfined synthetic control must complete the same outside writes,
traversal, prefix-sibling access, file and directory symlinks, hard-link access,
`MAP_SHARED` modification and `msync`, inherited writable-FD use, and descendant
fork plus exec. A byte-identical copy at a different executable path must also
execute unconfined, while the confined child must report `EPERM` or `EACCES` for
that same exec attempt. Each child is waited for and reaped. A fresh startup
marker and completion record distinguish a working sentinel from startup
failure. All target bytes are synthetic.

The accepted-runner test then requires explicit denial errnos, a real reaped
fork-and-exec child, outside-content read denial, closed FD 43, disconnected stdin,
in-root data writes, and successful state reads after a distinct-process relaunch.
After calibration the parent empties the state file and verifies it is empty.
It then verifies that the confined write changed the file before launching the
read phase. The parent compares
outside bytes, inode, size, mode, link count, mtime, and ctime. Mmap open, mapping,
and flush outcomes are reported separately; an open denial is not a claim that
an existing writable mapping was revoked.

A separate test bypasses staging validation only to characterize the same
policy against seeded aliases on nonmutable paths. Its scope is policy-only,
not production admission. Seeded aliases on permitted mutable files are rejected
before launch in a separate contract test. That rejection is not a kernel
alias-denial claim. Any unexpected outside byte or metadata change fails the
relevant test. Neither alias result admits ordinary app content.

## Commands and references

Portable checks use no native runtime or dependencies:

```bash
python3 -W error::ResourceWarning -m unittest \
  tools.test_native_qa_runner.RunnerContractTests \
  tools.test_native_qa tools.test_native_qa_webkit \
  tools.test_native_qa_ordinary tools.test_native_qa_cache tools.test_native_qa_stdio -v
```

The macOS sentinel class runs only in its explicitly selected fresh GitHub job.
A portable pass or a skipped sentinel class is never reported as enforcement
proof. No manual dispatch or watcher is installed.

The historical [sandbox resource-acquisition contract](https://www.manpagez.com/man/7/sandbox/)
explains inheritance and already acquired authority. The
[sandbox-exec command reference](https://www.manpagez.com/man/1/sandbox-exec/osx-10.12.6.php)
documents `-p` and `-D`. Hosted execution, not these historical references alone,
is required to establish behavior on the actual macOS build.
