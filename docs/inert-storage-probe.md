# Inert two-principal storage probe

This executable prerequisite tests two **synthetic marker files**, named disk and
auxiliary. It does not accept an image, application, existing file, arbitrary
path, executable, native-admission receipt, or resource-provider receipt. It
never changes principals, provisions users, installs software, starts a child
process, or calls Virtualization.framework.

## Data and roles

`ProbePlan` binds one generated UUID to two distinct registered non-root UIDs,
the namespace device/inode, and both files' device/inode/UID/mode/size. Each
4096-byte file contains an exact per-resource marker derived from that UUID.
An independently retained SHA-256 pins the plan bytes. This digest is an input
selection, not authentication or permission to launch anything.

The consumer creates a fresh namespace under the resolved system `/tmp`, with
mode 0755, and files with mode 0600. Names and plan metadata are public so the
caller can open a directory descriptor and inspect identity. The caller cannot
normally change these files or directory through POSIX permissions. Actual
ACLs and the selected OS may behave differently; the role probe records that
behavior rather than assuming a denial. Both roles operate relative to pinned
non-symlink directory descriptors. The consumer checks the exact bytes and
object identities before and after its read/write control.

Each caller operation first runs on its own fresh writable twin on the same
filesystem. The attempted operations are read-open, one-byte positional write,
write-open with truncation, replacement from a caller-owned file, hard-link
creation in a caller-owned directory, and two successive read/write opens.
Each result retains actual errno, its symbolic name, and successful partial
steps. Even one successful open before a later denial is a breach, not a denial.
Only EACCES or EPERM without partial access counts as an observed denial.
ENOENT, EXDEV, EROFS, unavailable operations, missing calibration, changed
identity, and missing principals fail or are unavailable. No result says PASS.

## Execution prerequisites

Only the existing native executor may separately authorize live role runs.
Nothing in this document grants that authority. This source increment has
**not** run either role on a Mac or with two actual kernel principals.

A future inert run needs two already-created disposable non-root principals,
a shared host/filesystem with Python 3.10 or later, and independent launch
control for each principal. The executable source and independently retained
plan digest must be trusted by that controller. The controller must retain
principal, host, and filesystem identity and pre/post object evidence. Neither
role obtains root, sudo, a GUI session, service signing, App Sandbox, or VZ-helper
access. OS/API availability and actual two-principal results remain unverified.

The following is a handoff recipe, not a command to switch users. Invoke each
line separately under the named existing principal. The program supplies no
launcher, privilege switch, deletion, reset, or fallback to the current UID.

1. Under the consumer, initialize once with the existing caller UID.

   ```bash
   python3 tools/inert_storage_probe.py consumer-init --caller-uid <caller-uid>
   ```

2. Retain the returned `probe_id` and `plan_sha256` independently. Under the
   consumer, run the positive control for the `initial` inert phase.

   ```bash
   python3 tools/inert_storage_probe.py consumer-check --probe-id <probe-id> --plan-sha256 <sha256> --phase initial
   ```

3. Under the caller, run its calibrated negative operations.

   ```bash
   python3 tools/inert_storage_probe.py caller-check --probe-id <probe-id> --plan-sha256 <sha256> --phase initial
   ```

4. Under the consumer, verify both original identities, bytes, and link counts.

   ```bash
   python3 tools/inert_storage_probe.py consumer-verify --probe-id <probe-id> --plan-sha256 <sha256> --phase initial
   ```

Repeat steps 2–4, in order, for `repeat`, `reopened`, `finished`, and
`retained`. These are only inert observation labels. No VZ object is alive,
and `finished` does not mean VM stop or helper teardown. No observation
completes any E1 lifecycle case, including before-VZ handoff.

Exit 0 means that individual command completed with its specified observation.
Exit 1 means a caller observation failed. Exit 2 means unavailable, including
an unknown UID, wrong role, missing file, changed marker, or burned reservation.
The JSON always contains `runtime_admission: false`. Reports are observations,
not authenticated enforcement evidence and are not consumed by a launch gate.
The controller must correlate both principals' output and the final consumer
verification; there is no aggregate acceptance operation.

## Retention and non-reuse

Before creating resources, the consumer reserves its UID for this one UUID in
its private fixed `/tmp/oc-inert-storage-state-<uid>` directory. The caller
reserves its own UID for that same UUID and role before any attempts. Exclusive,
fsynced claims burn each phase before execution, even on failure or crash.
Consumer phase progression requires the previous consumer verification. There
is no overwrite, reinitialize, reset, deletion, UID-release, or namespace-reuse
command. Caller scratch and any successfully created aliases remain retained.
A failed attempt is never repaired to obtain a passing observation.

These are durable **process-level** replay guards while the state is retained,
not permanent kernel UID reservations. A principal can erase its own journal;
root, an administrator, host restart, or a temporary-file cleaner can invalidate
the store. External supervision must prevent deletion/UID reassignment and
retire the whole disposable host instead of reusing it. This tool neither
implements nor proves that deployment boundary. Losing state invalidates the
run; it is not permission to rerun with the same identities.

## Source validation and remaining gaps

```bash
python3 -W error::ResourceWarning -m unittest tools.test_inert_storage_probe -v
```

The Linux tests use synthetic UID/state/errno doubles plus actual disposable
file operations. They prove result classification, controls, identity refusal,
and replay policy, not two-principal or macOS OS enforcement. The workflow runs
only those portable tests; it never invokes the live CLI roles.

This prerequisite does not test concurrent consumer use, mmap or leaked
handles, task/Mach rights, service API abuse, ancestor/ACL/authority changes,
root/admin or service compromise, App Sandbox/container/bootstrap access,
VZ/helper reopening, GUI behavior, or lifetime through actual start/use/stop
and host retirement. Hard-link attempts do not cover every alias mechanism.
Snapshots cannot rule out transient ABA changes. The independent native matrix
and every launch refusal remain unchanged. There is no new SDK or OS-support
claim and no change to either app bundle or its signing.
