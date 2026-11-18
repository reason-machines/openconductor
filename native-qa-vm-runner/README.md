# Non-launching VM runner source prerequisite

This separate AppKit target contains a closed configuration constructor, held
resource ownership, a single-VM lifecycle adapter, and its own signing integration.
The unchanged `OCVMAdmitNative()` gate refuses before resource acquisition or any
VZ construction. Its normal entrypoint still exits 78, opens no guest image and
starts no VM. It is not an admitted executor. No install, guest, OpenConductor,
WebKit or provider operation is part of the portable checks.

## Configuration boundary

`Profile.c` accepts only version 1, two CPUs, 4 GiB of memory, and this exact
ordered inventory: Mac platform, Mac boot loader, one block disk, one Mac
display, one USB keyboard, and one USB pointing device. Additional devices,
unknown configuration keys, missing devices, replacements, and duplicates
fail before the construction callback. The positive control constructs once.
Construction failure does not retry.

`Runner.m` uses that gate before constructing a fresh VZ configuration. It
sets a 1280 by 800 display at 144 pixels per inch, makes all transport arrays
empty, then checks the concrete device classes, counts, display geometry,
resource bounds, and runtime property names before calling VZ validation.
Unknown runtime properties fail closed, including empty properties introduced
by a newer SDK. The factory has no start operation. Its platform and attachment
arguments are not an implemented resource-authorization boundary.

## Owned invocation contract (behind closed admission)

`Runner.main` parses arguments, checks the unconditional native gate, and only then
can enter `OCVMOwnedInvocation`. There is no CLI, receipt or environment override.
The invocation holds four distinct validated resources (disk, auxiliary storage,
hardware model and machine ID) with close-on-exec FDs. Partial acquisition failure
closes everything acquired so far; normal completion retains them through the
configuration, VM and callbacks. Hardware identity data is read from the held FD
with a 1 MiB limit rather than reopening its name.

VZ disk and auxiliary-storage constructors accept **URLs, not these regular-file
FDs**. Held/path snapshots before and after construction detect observed changes
only. They cannot prevent a transient swap, concurrent mutation or VZ's later
URL use. Atomic identity-through-use, resource custody and inherited capability
control remain unimplemented admission prerequisites. No snapshot PASS closes
that gap. The adapter does not acquire, create or provision a guest.

The invocation calls the existing closed factory and owns exactly one
`VZVirtualMachine` on the main serial queue. `Lifecycle.c` owns these serialized
state transitions: prepared → starting → running → stopping → stopped. A bounded
run/start budget is followed by one bounded stop budget; deadlines never extend
on repeated requests. Start and stop callbacks are tracked independently. Wrong
VM identities, regressing/zero clocks, overflowing deadlines, duplicates and
out-of-order events refuse without mutating state. Late start completion cannot
revive a stopping invocation. A successful stop callback is **not** a stopped
observation: normal resource release requires no pending callbacks and a read of
`VZVirtualMachineStateStopped` from the same retained VM.

The current zero-channel profile has no workload/input/result protocol.
`OCVMWorkloadChannelAvailable()` is hardcoded false. Even behind native admission,
this branch requests an unsupported-workload stop without calling start. The
start/stop adapter is source plumbing, not an enabled execution path. There is
no guest-agent, socket, network, serial, console, directory-share or disk-result
fallback. A separately reviewed integration/profile is required for real work.

If stop is still unconfirmed when the stop budget expires (including an
uncompleted start/stop callback), the process emits a bounded failure diagnostic
with `native_admission=false` and `same_vm_stopped=false`, then exits 75 without
normal owner unwinding. Process exit is not VM-stop proof. A confirmed observation
also returns nonzero 78 with `workload_result=false` and a separate
`vm_start_dispatched` flag. Under the current unsupported-channel branch this
flag is false: observing a newly created, never-started VM stopped is **not**
evidence of guest shutdown. It never reports workload success, isolation, parity
or admission. Native T1–T12 remain unverified.

The fixed resource sizes define construction policy, not a claim that a host
has enough capacity or that a particular macOS guest supports the profile.

A Foundation-only validator was rejected because it would not constrain the
real VZ constructor. The Objective-C constructor shares its pre-construction
gate with the portable C checks. The C checks still cannot prove Objective-C
projection, VZ acceptance, runtime array contents, or native prevention.

## Signing boundary

The runner has its own bundle ID and entitlement file, separate from the normal
Tauri app. Only `com.apple.security.app-sandbox` and
`com.apple.security.virtualization` are requested. The build script defaults to
ad-hoc signing and never searches the keychain for a signing identity. An
explicit `--identity` may select one in a separately authorized build.

`tools/native_qa_vm_signing.py` rejects unexpected bundle content and identity
before signature inspection. It verifies the code signature and reads the
signed entitlement blob, rejecting extra, missing, false, and nonboolean
values. Reading that blob is not kernel-enforcement proof. No executable in
the bundle is run by the checker.

Pull requests affecting this target run only the portable source checks. The
compile/sign job remains workflow-dispatch-only; adding the PR trigger does not
run it or authorize a dispatch. When explicitly dispatched, the macOS CI job
compiles the ARM64 macOS 15 target, signs it, and reads back
the signature. It never invokes the resulting executable. It uses no secrets,
guest files, restore images, or provider credentials. No runner binary is
installed or invoked. Successful main builds retain the signed bundle in the
separate inert archive described below.

### Inert CI identity receipts

On a successful push to this repository's main branch, the existing compile/sign
job may publish exactly `receipt.json` and `build.json` for seven days. PR jobs
publish neither. Packaging opts in with `--ci-receipt-dir` and refuses non-ad-hoc
signing, incomplete CI context, a source/workflow SHA mismatch, dirty tracked or
unexpected untracked inputs, linked identity inputs, or an existing output path.
The directory must be outside the checkout. The final signed executable is hashed
after signature readback; the existing identity checker performs a local
self-consistency check without running it. That check is not authentication.

`receipt.json` retains #931's schema. `build.json` records source, workflow,
run/attempt/job, toolchain observations and the receipt-byte digest. Neither
self-authenticates. SDK/compiler strings are diagnostics, not hermetic-build proof.
This receipt artifact still contains only two bounded JSON files. The separate
bundle artifact retains the exact post-sign executable rather than rebuilding it.

### Retained signed bundle

The same main-only compile/sign producer accepts `--ci-bundle-archive` alongside
`--ci-receipt-dir`. It verifies the signed candidate against the existing receipt,
then writes a new, bounded ZIP outside the checkout. It never runs the executable.
The separate artifact is named `oc-qa-vm-bundle-<run-id>-<attempt>` and contains
`bundle.zip`. The existing JSON-only artifact and its parser are unchanged. PR
builds publish neither artifact. Both artifacts expire after seven days.

The inner ZIP contains exactly the receipt, build manifest, bundle Info.plist,
CodeResources and signed executable. It preserves executable mode 0755 and
standalone regular-file modes. `inspect_retained_bundle` reads those five members
in memory without extraction. It rejects missing bytes, duplicate or extra paths,
links, unsafe modes, oversized input, a different selected source or build ID,
and executable bytes that differ from the receipt. The build manifest must bind
the exact receipt bytes. The producer rechecks signatures and all input snapshots
before writing a new output file. Existing output files are never overwritten.

The archive inspection establishes byte retention and self-consistency only. It
does not authenticate an artifact service, cryptographically verify a retained
signature, preserve atomic integrity through later execution, or grant admission.
Synthetic archives test retention and rejection behavior, not macOS signing or
confinement. Actual signed-output retention requires the automatic main producer
and readback of its retained artifact.

`tools/native_qa_vm_receipt.py` exposes `ApprovedBuild` and
`consume_ci_receipt(selection, reader)`. Selection must independently pin numeric
repository/workflow identities, the full source SHA, exact run/attempt and immutable
artifact ID. A trusted broker must resolve these through authenticated GitHub
metadata, including the workflow at the selected source, whole-run and producer
job success, repository/head linkage, non-expiry and the service archive digest.
It must cap the download at 256 KiB. The consumer checks that digest, rereads
run/job/artifact metadata and parses exactly two allowlisted JSON members in memory
without extraction, with a 64 KiB bound per file. Unknown or missing fields,
self-reported authentication, wrong/stale identities, links, executable payloads,
duplicate members/keys, manifest disagreement and observed mutations refuse.
There is no latest-successful or candidate-derived fallback.

`tools/native_qa_vm_github.py` implements the read-only `GitHubReader`. Its
`ApprovedGitHubBuild` adds an independently selected numeric producer job ID,
bundle artifact ID and SHA-256 of the reviewed workflow bytes to `ApprovedBuild`.
The caller must review that workflow to establish the `compile-sign` key and its
unique fixed job name. The reader fetches the pinned workflow content and checks
both its Git blob identity and the approved SHA-256. It never selects a latest
build or derives approval from downloaded receipts.

Every API request is a GET to an exact selected path at `api.github.com`. The
caller supplies a credential directly; no environment lookup or CLI is provided.
Only the selected artifact ZIP endpoint may redirect once to GitHub
`productionresultssa<N>.blob.core.windows.net` storage. That request receives no
GitHub credential, and no further redirect is followed. Other storage origins
refuse until reviewed. Responses are bounded while reading, and transport errors
do not expose credentials, response bodies or signed URLs.

GitHub artifact REST metadata has no `run_attempt` or producer job ID. The reader
checks service repository/run/head linkage and immutable artifact IDs, then
requires artifact creation and update timestamps inside the independently
selected numeric producer job's successful exact-attempt lifetime. The approved
workflow digest establishes that job's producer behavior. Names or receipt
claims alone never establish attempt linkage. Missing job attempt, source,
timestamps, service size or digest refuses. This relies on GitHub's service
metadata and the reviewed producer, not a separate artifact attestation.

`consume_bundle()` checks the original receipt artifact, the service digest of
the separate bundle artifact, its sole bounded `bundle.zip`, and all five inner
members. It compares the retained receipt bytes with the independently consumed
receipt artifact and returns the exact inner archive without extraction. It
rereads run, job and artifact identity before returning. Synthetic HTTP fixtures
exercise this reader without real authentication or signing. Live authenticated
reader consumption remains unverified until exercised through an authorized
integration. The result is byte/provenance evidence, never a launch permit.
Retained-signature verification and native execution are not wired here.
Snapshots detect observed changes, not all transient swaps. Atomic verify-to-launch
integrity, effective confinement and native admission remain unproved.

## Source checks

The following portable commands execute only synthetic construction/lifecycle
callbacks, temporary POSIX resource fixtures, source-wiring checks and signing
fixtures. Their results are not Objective-C execution or native prevention proof:

```bash
out=$(mktemp -d)
cc -std=c11 -Wall -Wextra -Werror -pedantic \
  native-qa-vm-runner/Profile.c native-qa-vm-runner/ProfileTests.c \
  -o "$out/profile-tests"
"$out/profile-tests"
cc -std=c11 -Wall -Wextra -Werror -pedantic \
  native-qa-vm-runner/Lifecycle.c native-qa-vm-runner/LifecycleTests.c \
  -o "$out/lifecycle-tests"
"$out/lifecycle-tests"
cc -std=c11 -Wall -Wextra -Werror -pedantic \
  native-qa-vm-runner/ResourceValidator.c native-qa-vm-runner/HeldResources.c \
  native-qa-vm-runner/Lifecycle.c native-qa-vm-runner/HeldResourcesTests.c \
  -o "$out/held-resources-tests"
"$out/held-resources-tests"
rm -rf "$out"
python3 -m unittest tools.test_native_qa_vm_runner_source -v
python3 -W error::ResourceWarning -m unittest tools.test_native_qa_vm_signing tools.test_native_qa_vm_receipt -v
bash -n scripts/package-native-qa-vm-runner.sh
```

The initial construction implementation accepted a forbidden attachment. The
same test failed with `FAIL: unsupported profile must be refused`; the closed
inventory check makes it pass. This is red/green development of a new source
boundary, not a newly discovered bypass in the existing host runner.

## Acceptance remains closed

This increment implements only part of T1's source prerequisite. It does not
complete T1 or any T2–T12 acceptance. See the existing
[adversarial acceptance specification, section 7](https://reasonmachines.com/agents/ffdaf11b-f80a-4b97-bff0-12404bc9ff73?page=8aaca94a-1221-4dfa-9f06-eca720352856).

Before any runtime can be considered, the missing work includes a prepared,
compatible disposable guest; exact resource and backing-file identity with
race handling; inherited-capability refusal; SDK and signature identity bound
to the actual runner; effective native configuration and prevention controls;
and native validation of the new sole-owner lifecycle handling through the same
VM's actual stop. Portable state transitions do not establish that native behavior.
T1–T12 must be exercised under a separately admitted native unit. The factory
must remain unreachable from the entrypoint until those prerequisites are met.
No guest-generated receipt or portable PASS can open that boundary.

The existing host sandbox runner and unconditional filesystem-admission refusal
are unchanged. No host App Sandbox result is substituted for guest isolation.
The normal app's signing, startup, provider flows, and release package are
unchanged. There is no native UI evidence because no app or guest was launched.

## API references

- [VZ configuration and validation](https://developer.apple.com/documentation/virtualization/vzvirtualmachineconfiguration.md).
- [Mac platform identity and auxiliary storage](https://developer.apple.com/documentation/virtualization/vzmacplatformconfiguration.md).
- [Display construction](https://developer.apple.com/documentation/virtualization/vzmacgraphicsdisplayconfiguration/init(widthinpixels:heightinpixels:pixelsperinch:).md).
- [USB controllers, macOS 15](https://developer.apple.com/documentation/virtualization/vzvirtualmachineconfiguration/usbcontrollers.md).
- [VM serial-queue ownership](https://developer.apple.com/documentation/virtualization/vzvirtualmachine/init(configuration:queue:).md).
- [VM stop completion and legal states](https://developer.apple.com/documentation/virtualization/vzvirtualmachine/stop(completionhandler:).md).
- [URL-based disk attachment](https://developer.apple.com/documentation/virtualization/vzdiskimagestoragedeviceattachment.md).
- [URL-based auxiliary storage](https://developer.apple.com/documentation/virtualization/vzmacauxiliarystorage.md).

These are public SDK sources, not claims about Conductor's shipped behavior.
No REA operation was needed or performed for this isolated infrastructure change.
