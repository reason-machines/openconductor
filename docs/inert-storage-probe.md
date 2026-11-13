# Inert two-principal storage probe

This executable prerequisite tests two **synthetic marker files**, named disk and
auxiliary. It does not accept an image, application, existing file, arbitrary
path, executable, native-admission receipt, or resource-provider receipt. It
never changes principals, provisions users, installs software, starts a child
process, or calls Virtualization.framework.

## Data and roles

`ProbePlan` binds one generated UUID to two distinct registered non-root UIDs,
the public namespace device/inode, a private storage directory's
device/inode/UID/mode, and both files' device/inode/UID/mode/size. Plan version 2
requires the private directory. Version 1 is rejected, not upgraded in place.
Each 4096-byte file contains an exact per-resource marker derived from that UUID.
An independently retained SHA-256 pins the plan bytes. This digest is an input
selection, not authentication or permission to launch anything.

The consumer creates a fresh, consumer-owned namespace under resolved system
`/tmp` with mode 0755. The plan and role reports stay public in that directory.
Both marker files have mode 0600 and live in its consumer-owned `resources`
subdirectory, which must have mode 0700. The caller can inspect the private
directory's identity from the public parent but cannot normally traverse it.
File mode 0600 alone does not prevent hard-link creation on macOS. The private
search boundary addresses that observed failure without removing the link test.
Actual ACLs and the selected OS may behave differently; the probe records
behavior rather than assuming a denial.

The caller opens only the pinned public parent and issues each actual operation
against its fixed `resources/<resource>.marker` relative path. It never treats a
failed marker stat or private-directory open as that operation's denial. Before
each attempt it checks the private directory's non-following metadata against
the plan. Only the consumer opens the private directory and checks both marker
identities, exact bytes, and single-link counts before and after its control.
Missing, replaced, symlinked, searchable, or wrongly owned storage is unavailable.

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
Nothing in this document grants that authority. The version 1 hosted run
[failed on hard-link creation](../evidence/qa/inert-storage-alias-failure/README.md).
The version 2 correction has **not** run on macOS or with two actual kernel
principals. Portable tests do not establish the corrected kernel boundary.

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

## Manually selected hosted controller

`HostedObservation` in `tools/hosted_inert_storage_probe.py` correlates the
version 2 `ProbePlan`, actual role identities, per-command outputs, and consumer
pre/post resource measurements. The controller independently checks public
namespace and private-directory metadata, not the inaccessible marker contents.
The private resource identity, bytes, and link checks run in the actual consumer
launcher. No admission gate changes. The controller collects one bounded
observation instead of introducing a provider or permission receipt.

The separate `Hosted inert two-principal observations` workflow is **dispatch
only**. Pull requests and main pushes run portable controller fixtures, never
live role commands. E1 remains the sole execution owner. Publishing or merging
this source does not authorize a dispatch or any operation on Sven's Mac.

The exact invocation, after a separately authorized dispatch on a fresh hosted
worker, is:

```bash
python3 -W error::ResourceWarning -m tools.hosted_inert_storage_probe \
  --execute-hosted-prerequisite --expected-head <exact-dispatched-commit-sha>
```

The workflow selects `macos-15` and Python 3.12. The controller requires Darwin,
GitHub-hosted context, an exact 40-character dispatched/checked-out commit and
clean tracked inputs. Context environment fields are selection checks, not
independent host attestation. Observations retain the actual macOS/kernel and
architecture, run/attempt, selected and observed checkout SHA, source hash,
actual UID/EUID/GID/groups, raw version 2 plan bytes and digest, public namespace
device/inode, private-directory device/inode/UID/mode, and each resource's
UID/device/inode/mode/size/link count. Every invocation retains its exact argv,
stdout, stderr and exit status or transport error.
No SDK, signed-service or macOS 26.4 result is inferred from this worker label.

The original non-root job UID remains the caller. The consumer must be the
**already existing** `daemon` directory-service record with positive UID/GID 1
and a non-login shell. There is no fallback to `nobody`, whose UID representation
can differ, or another account. The trusted workflow controller invokes only
that existing consumer with `/usr/bin/sudo -n -u '#1' -g '#1' --`, an absolute
Python interpreter and fixed isolated source. The roles themselves must have
matching non-root real/effective UIDs. No account/service registration, sudoers
edit, permission revocation, login/session setup, root role execution, provider,
app or VZ launch is provided. Missing noninteractive sudo, an inaccessible
interpreter or wrong actual consumer identity fails without a retry path.

The controller copies only the fixed probe source into a fresh public-readable
synthetic code directory under resolved `/tmp`; roles never execute from a
private checkout. It checks the bytes before and after every invocation, closes
ambient descriptors, disconnects stdin and strips the inherited environment.
It refuses any preexisting principal journal and never deletes or repairs state.
Each of the five inert labels requires both positive consumer read/write checks,
all twelve calibrated caller operations, final consumer verification and matching
pre/post snapshots. Each consumer report includes its actual public namespace,
private-directory metadata, and actual per-resource identities and link counts.
The controller validates those reports against the plan before recording
snapshots labelled `resource_measurement: consumer_role_report`. Those snapshots
remain trusted consumer measurements, not independent caller access to resources.
Even a failed caller transport still attempts final consumer verification. Failed commands retain their actual stdout, stderr and exit status;
no missing operation, principal or file becomes success.

The output is one JSON **observation**, not an authenticated receipt or launch
permit. Exit 0 and `BOUNDED_SYSCALL_OBSERVATIONS` mean only that these correlated
direct syscalls met the contract. Exit 2/`UNAVAILABLE` means no role invocation
started; exit 1/`FAILED` includes an unavailable or failed role invocation.
`runtime_admission` and `native_admission` are always literal false.
`lifecycle_cases_exercised` stays empty and `lifecycle_case_status` is `NOT_RUN`.
The workflow retains only this output for seven days, including failed runs.

**The caller may retain administrative sudo authority.** This test deliberately
neither uses nor revokes that authority for caller operations. Consequently,
observed denials cannot establish protection from administrative escalation,
service APIs, inherited capabilities or a hostile workflow controller. Public
source hashes and snapshots do not exclude transient replacements. Worker
retirement is an external deployment requirement, not permanent kernel UID or
namespace reservation. No real VM lifecycle or any of the 60 native cases is
completed, even if all five inert labels succeed. The existing unconditional
filesystem-admission refusal remains unchanged.

Portable source checks for the controller and the original role probe are:

```bash
python3 -W error::ResourceWarning -m unittest \
  tools.test_inert_storage_probe tools.test_hosted_inert_storage_probe -v
```

These controller tests use identity, transport and errno doubles. They are not
hosted macOS execution or kernel-enforcement evidence. Native execution remains
**NOT_RUN** until the separately authorized workflow actually produces and
independently verifies its correlated output.

This prerequisite does not test concurrent consumer use, mmap or leaked
handles, task/Mach rights, service API abuse, ancestor/ACL/authority changes,
root/admin or service compromise, App Sandbox/container/bootstrap access,
VZ/helper reopening, GUI behavior, or lifetime through actual start/use/stop
and host retirement. Hard-link attempts do not cover every alias mechanism.
Snapshots cannot rule out transient ABA changes. The independent native matrix
and every launch refusal remain unchanged. There is no new SDK or OS-support
claim and no change to either app bundle or its signing.
