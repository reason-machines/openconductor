# Two-file authority adapter contract

Conductor Rebuild. Source design and pure rejection contract, not an executor.
V2 source grounded at main `06500f5ef1230513090e42aebe0222fd4f83a72d`.
The predecessor in PR #1196 passed one ACC-admitted 41-test synthetic run; that
historical result does not verify this v2 source or authorize another run.

## What this increment delivers

`tools/native_qa_authority_contract.py` correlates a finite JSON report with
separately selected external observations. It performs no file, process, OS,
network, signature, installation or launch operation. Its only successful output
is `CONTRACT_CORRELATED_NOT_NATIVE_QUALIFIED`, with a read-only
`native_admission` property that is always false. The existing unconditional
`native_qa_cache.require_filesystem_isolation` refusal is unchanged.

The external native authentication adapter does not exist in this increment.
Constructing `ExternalContext` is not authentication. A caller can invent such a
Python object, so a contract readback is never native proof, a launch permit or a
claim that observations occurred. A future trusted adapter must independently
select the deployed supervisor, authenticate the report and actual OS/probe
observations, then supply its report digest and approved context. A supervisor
signing a caller-provided errno is insufficient.

The fixture suite builds synthetic documents only. It does not run inert-file
mutations, create a native process, calibrate a syscall or exercise macOS policy.
A fixture success proves document acceptance/rejection behavior only.

## Recommended native topology, not deployed

Use a dedicated-UID trusted descriptor consumer behind an independently
controlled privileged supervisor/observer. This is the smallest proposed
experiment for two backing-resource files, not full-app containment.

- The supervisor owns its executable, dependencies, configuration and namespace
  independently of the caller. Its privileged work is a small fixed operation
  set, never caller-supplied code, paths, arguments, environment or imports.
- The consumer has a unique nonlogin UID, different from the caller and
  supervisor. Clear supplementary groups and irreversibly drop real, effective
  and saved credentials before any consumer executable or loader runs. A
  nonlogin label alone is not authority separation.
- The original caller is the actual preselected provider process with its actual
  lifetime, credentials, groups, task/Mach rights and service/elevation access.
  A newly sandboxed or same-UID shell child is not a substitute.
- The peer is a distinct live process with the approved unprivileged authority,
  not a second label on the caller. Same UID means two processes, not two
  independent security principals.
- The observer is under the supervisor's independent authority. It owns file and
  directory pins and records pathname-to-object identity and content before and
  after the scheduled operations. Actor assertions are not its observations.

This route assumes denied actors have no root/admin/DAC override, consumer
injection or mutation-broker authority. If the actual caller has such authority,
refuse rather than silently reducing the threat model. The narrow fixed consumer
and its probe are trusted code. DAC cannot prevent a compromised consumer from
forwarding its writable FD or serving as a confused deputy. Hostile guest/app
code is outside this design.

No service, account, privileged helper or disposable destination is installed by
this change. Any later bounded execution remains with ACC and sole native owner
E1. This is a concrete deployment gap, not a recovered user blanket installation
ban or a new approval question.

## Fresh resource custody

The supervisor creates exactly two fresh 4096-byte regular inert files, `disk`
and `aux`, after authority separation. They have never been caller-owned or
caller-writable. Do not import or chown existing resources and call that a
revocation boundary. Existing writable descriptors and shared mappings survive
mode changes and closing a different descriptor.

Use a selected local filesystem with trusted canonical ancestry. Every
replaceable ancestor must deny caller/peer replacement through effective
ownership, permissions and ACLs. Do not place it under user-writable homes,
temporary roots, app containers or mount points. Platform system aliases must be
resolved to approved canonical components, not accepted from the request.

Create through pinned directory descriptors with exclusive no-follow operations.
The leaf files are root-owned mode `0600`, initially singly linked, with no
unexpected ACL, flag or mount behavior. A trusted directory may grant traversal
without write/list access. Checking only leaf O_NOFOLLOW does not secure
intermediate components. The observer must retain full component identities and
rights, not merely pathname hashes.

`FilePin` stores the approved volume, inode, UID, GID, mode, link count, flags,
ACL digest and ancestry/entry-binding digest. The native adapter must obtain and
authenticate the underlying observations. A digest string alone does not prove
permissions, locality or lack of handles. Snapshots add size, bytes and actual
observer lifetime. Directory link counts are not required to equal one; atime
need not remain equal.

## Single post-drop transfer

1. Independently select the deployment/code/configuration, local volume, nonce,
   original caller lifetime, peer authority and finite schedule.
2. Establish supervisor custody, create the protected pair and a private unnamed
   socketpair. The consumer initially inherits only fixed control/result
   channels and inert stdio, not the target or supervisor-directory FDs.
3. A trusted bootstrap permanently drops groups, GID and UID before consumer
   code runs. Remove unrelated descriptors and inherited task, fileport,
   bookmark, Mach/bootstrap and credential authority. `close_fds` does not remove
   Mach rights. Refuse if the native implementation cannot establish the drop
   and inherited-capability inventory on the selected OS.
4. Independently bind the exact post-drop child lifetime, credentials and actual
   loaded code to the channel. Connection-time `getpeereid` alone is not a live
   post-drop attestation. Pre-launch path/hash checks are not atomic image binding.
   Root-controlled immutable deployment and post-exec image observations remain
   required.
5. Transfer exactly two `O_RDWR` FDs once using a bounded SCM_RIGHTS message.
   Require the nonce/roles, reject missing, extra, duplicate or truncated
   ancillary data, compare receiver descriptor identity with the pinned pair,
   and set close-on-exec. Close the transfer channel after acknowledgement.
6. Give no writable handle, mapping, bookmark, directory FD, task right or
   mutation endpoint to caller or peer. The fixed consumer has no caller-driven
   RPC, plugin, shell, arbitrary child execution or FD export. Close-on-exec does
   not prevent fork inheritance, so fork is not a supported consumer feature.

The Python contract correlates the externally authenticated bootstrap,
post-drop and capability-inventory witnesses with approved values. It does not
implement or verify the native transfer. A matching inventory digest cannot
establish an inventory that was never actually observed.

## Fixed first native experiment

The proposed future unit has one supervisor, one consumer, the real caller and
one peer. It uses two protected 4096-byte files, at most 1 MiB of actor-owned
controls and a fixed 120-second deadline. It has no VM, guest, app, UI, provider
authentication, network or preserved-state target. This is not a dispatch request.

For each caller/peer and disk/aux pair, run the seven operations below. That is
28 denied attempts. Each needs the same actual actor and operation to succeed on
a separate owned calibration object on the same volume, 28 positive controls.
Destructive calibrations use fresh fixtures. The consumer also performs four
read/write/fsync/readback control sequences: both protected files before and
after the quiescent denial phase. Those writes use fixed supervisor-selected
bytes and independently observed expected changes.

The single registry `OPERATIONS` defines all syscall stages, successful results,
denial positions and closed operand schemas, and derives the matrix. `CONTROL`
defines the consumer stages and operand schemas. Fixtures derive their stages
and field sets from these registries, not a second operation list.

1. `write`: O_RDWR open, then a non-noop pwrite if open succeeds. A passing
   protected result denies at open.
2. `truncate`: path-based truncate to a different size.
3. `mmap`: O_RDWR open, MAP_SHARED with read/write protections, store, then msync.
   Protected open denial leaves mmap/store/msync NOT_REACHED. This proves
   acquisition denial, not an actual mmap syscall denial or mapping revocation.
   If intake demands direct mmap denial on an existing valid writable FD, that
   requirement remains unsatisfied by this scope.
4. `chmod`: change to a different mode. A no-op chmod is not a mutation control.
5. `replace`: verify an existing actor-owned same-volume replacement, then rename
   it over the protected file. EXDEV, ENOENT and read-only volume errors do not
   count as access-control denials.
6. `replace_parent`: verify an absent sibling destination, then rename the
   protected containing directory to it. The observer checks original and moved
   entry bindings plus pinned ancestry, rather than inferring parent protection
   from a file-write failure.
7. `alias_write`: create an owned symlink to the exact existing protected file,
   then O_RDWR reopen through it and pwrite if admitted. Alias creation may
   succeed; protected reopen must fail. This is a symlink case, not every alias,
   hardlink or security-scoped bookmark mechanism.

Require actual protected syscall return `-1` with EPERM/EACCES at the intended
stage. No startup/preflight failure, invalid arguments, ENOENT/EINVAL/EBADF/EXDEV,
timeout, missing attempt or absent actor counts as prevention. Calibrations must
reach their mutations, including mmap store and synchronization. The observer
pins the protected bytes and identity around each attempt while the consumer is
quiescent. Unexpected success stops further attempts and retains evidence.

Snapshots alone cannot prove an attempt happened or rule out transient writes.
The pinned syscall probes must be trusted code in each actual actor, or an
independent OS witness must supply the real attempt/results. A signed errno
forwarded from an untrusted caller is not that witness. There is no such native
probe/authentication implementation in this increment.

## Pure contract API

```python
readback = validate_receipt(raw_json_bytes, external_context)
assert readback.status == "CONTRACT_CORRELATED_NOT_NATIVE_QUALIFIED"
assert readback.native_admission is False
```

`ExternalContext` is selected outside the report. It contains source/config,
nonce and OS build; the four actual actor identities; the two approved file
pins; bootstrap/post-drop/capability witnesses; the digest of the independently
authenticated observation report; and exactly 60 ordered, frozen `RowSelection`
objects in a tuple. Environment USER, a raw PID or a
report-selected key cannot supply this context. The module has no credential
lookup, signature library or transport and cannot mint this trust itself.

`Actor` binds boot, PID, birth token, executable digest, real/effective/saved UID,
groups and a digest of the independently observed full authority context. The
last digest must include privileges, saved groups and relevant task, Mach,
provider/deputy and escalation channels, not merely matching Unix UID values.

The report has closed fields for version/source/config/nonce/OS/phase, actors,
files, transfer, records, terminal and `native_admission=false`. It supports only
one ACTIVE_QUIESCENT interval. Records are ordered as follows:

- Two before-consumer controls.
- For caller then peer, disk then aux, registry operation order, one successful
  calibration followed by its actual protected denial.
- Two after-consumer controls and a same-lifetime live/quiescent retained terminal.

This is exactly 60 record groups, not 60 native syscall results. Mmap and other
operations have several stage records. Every group has a monotone sequence,
closed identity keys, complete stages and independently observed snapshots.

The parser bounds input to 256 KiB and rejects duplicate JSON keys, unknown
fields, noninteger identities, incomplete/duplicate/substituted cells, wrong
phase/order, actor or pin mismatch, transfer-witness drift, failed controls,
preflight errno, unsupported errors, relabelled NOT_REACHED stages, changed
bytes/objects/ACL/ancestry, and lost final actor/observer identity. It never reads
evidence paths, fetches URLs or executes code from reports.

### V2 operand and event correlation

V2 replaces the v1 wire format; there is no legacy acceptance path. Each external
`RowSelection` pins sequence, kind, role, file, operation, phase, the full selected
`Actor`, an opaque actor-lifetime token, an operand digest and a record-witness
digest. The selection must match the exact matrix cell. One actor retains one
unique token throughout the interval. Each reached stage must name that token;
NOT_REACHED stages have no event actor or acquired capability. These are recorded
relationships, not proof of continuous lifetime or actual attribution.

The closed `operand` object retains volume/target/source/alias identities and
adds a target entry, optional source entry and an ordered `plan` of argument
objects. Every stage has exactly the argument fields defined by its registry
schema. Missing, unknown and extra arguments or stages are refused even when a
synthetic test rebinds all hashes. Numeric identities, offsets, lengths, modes,
descriptors and addresses use exact non-Boolean integers, never equal-valued
floats or Booleans.

- Entries bind volume, inode, kind, ancestry, one leaf name and a containing
  directory's volume/inode/ancestry. Names cannot be empty, dot entries, paths
  or contain NUL. Directory observations and namespace custody remain external.
- Open plans select `O_RDWR|O_NOFOLLOW`; alias reopen selects `O_RDWR` through
  the distinct symlink entry and separately binds its resolved regular target.
  The symbolic flags are contract values; native flag translation and actual
  resolution must be observed by the future adapter.
- Pwrite/store plans select offset zero, 32 bytes and the digest of a fixed
  32-byte nonce/file/position marker. Consumer positions are `before`/`after`;
  other positions are `row:<sequence>`. The marker is SHA-256 of
  `<nonce>:<file>:<position>` encoded as UTF-8. Truncate selects length zero;
  chmod selects mode `0666`. These are non-noop mutations of the seeded object.
- Mmap selects offset zero, 4096 bytes, `PROT_READ|PROT_WRITE`, `MAP_SHARED`, then
  an in-range store and `MS_SYNC` over the same mapping. Protected open denial
  still leaves mmap/store/msync NOT_REACHED; this is acquisition-only scope.
- An FD or mapping reference binds its numeric value, acquisition origin, row
  sequence, actor-lifetime token and target volume/inode. Opened descriptors
  must match that row's actual open return; mapping references must match its
  mmap return. Consumer descriptors instead reference `postdrop_transfer` at
  sequence zero, remain stable within and across their controls, and are
  distinct for disk and aux. No transfer or acquisition is performed here.
- Parent rename binds the actual containing directory entry, its containing
  parent, and a distinct absent sibling name under that same parent. Preflight
  and rename must use identical source/destination records. File and directory
  pins cannot substitute for each other. Leaf-only evidence is insufficient.

The two per-row digests have different inputs. `operand_sha256` covers the
complete `operand` object, including every planned argument and capability
reference. `witness_sha256` covers the complete record: sequence/cell/phase,
actor-lifetime token, operands, attributed stage results/errnos and both observer
snapshots. Neither digest appears in the report itself, so neither is excluded
from a self-referential report field. Both values are selected outside it.

`canonical_digest(value, domain)` uses `json.dumps` with sorted keys, compact
separators, `ensure_ascii=True` and `allow_nan=False`, then ASCII encoding. Its
SHA-256 input is the UTF-8 prefix `OC_INERT_PAIR_CONTRACT_V2:<domain>` followed by
one NUL byte and those canonical bytes; domain is exactly `operand` or `witness`.
Wire parsing first rejects duplicate keys and nonfinite constants; closed schema
and exact-type checks precede digest comparison. JSON key order is immaterial,
but numeric types and list order are not normalized. The whole-report external
digest still covers the original raw bytes, not canonical JSON.

A matching plan hash does not establish execution. The future trusted adapter
must independently select the intended plan and authenticate the actual operands,
results, snapshots and attribution before supplying a separate witness hash.
Never construct native trust anchors from submitted actor JSON, its keys or its
claimed digests. The fixture helper deliberately does that only for synthetic
semantic tests; correlation tests retain the separately pinned row selections.
Constructing `ExternalContext`, `RowSelection`, or a matching hash authenticates
nothing. Actual-caller/peer capability assessment, continuous event attribution,
actual descriptor/mapping provenance, original namespace custody and native
syscall truth remain unimplemented external dependencies.

Calibration baseline identities and replacement-result identities are reserved
across the complete matrix. A later calibration cannot reuse either as a baseline
or replacement source. Alias-target inodes are positive integers, never
Boolean or floating-point values. Nonalias operations require no alias target.

The successful readback records correlation only. It does not supply an
admission flag that callers may opt into. Any caller-supplied admission or GUI
verification field is rejected. Neither this readback nor its tests can replace
`require_filesystem_isolation` or change product startup policy.

## Lifecycle and intended-consumer gaps

This first contract cannot accept stop, restart or owner-loss proof. A proposed
larger schedule repeats the matrix at READY, ACTIVE_QUIESCENT, authoritative
STOPPED and RESTARTED_QUIESCENT, 112 denials plus 112 matching calibrations.
Stopped phases preserve the same resources; no consumer success is claimed while
stopped. Restart needs a different consumer lifetime and the same owner/pins.
Owner or observation loss means INCONCLUSIVE and retained resources, not an
automatic cleanup/restart fallback. Those phases need their own reviewed source
increment and real controlled execution.

The descriptor consumer is NOT the intended VZ backing-file consumer. Main
`Runner.m:prepareProfile` receives VZ disk attachment and Mac auxiliary-storage
objects. Apple's documented disk/auxiliary constructors are URL-oriented. No
supported bridge from root0600 inaccessible paths plus inherited FDs to BOTH
constructors is established. Do not silently grant ACL/path access, invent
`/dev/fd`, construct under root before dropping, or export a mutation service.
An inert FD pass would not qualify VZ/bootstrap or the real product.

The declared remote computer schema supports PID/path UI selection. It has no
filesystem run-as-PID hook, supervisor deployment or authority-transfer method.
`devices_exec` creates another process; it is not evidence that the existing
original provider process executed these operations. A supported in-process
fixed probe or independent native result witness remains a separate integration
gap. No debugger/injection workaround is proposed.

E1's actual GUI lifetime and provider-issued target/action receipt are independent
requirements. The inert consumer PID cannot qualify the GUI, and an old stopped
PID/window or raw CoreGraphics ID is not a provider target. Existing pending user
choices are neither answered nor duplicated. UI and native enforcement remain
NOT_RUN; preservation remains INCONCLUSIVE.

## Alternatives and next implementation boundary

Same-UID mode changes and advisory locks do not remove existing caller authority.
A sandboxed XPC consumer does not restrict an unsandboxed caller's own file
rights. A public mutation RPC can return the authority the service was meant to
separate. A full disposable guest is a larger full-app path, but still needs
independently owned backing storage, a real guest/bootstrap and effective channel
and lifecycle proof. The current VZ entrypoint exits78. No second VM runner is
introduced here.

A future native implementation must supply the independent supervisor/bootstrap,
authenticated actor/result witnesses, fresh namespace custody and exact intended
consumer integration. Keep that work separate from this pure source contract.
The existing artifact byte reader, restricted visual startup and child-only
sandbox do not supply those capabilities. Source reviewer 25deeefb and two
retained design reviewers conditionally support this narrow prerequisite only.

The proposed portable command, only after revision-bound source review and a
separate ACC grant for the frozen v2 candidate, is one foreground attempt:

```bash
bash -c 'ulimit -v 262144 && ulimit -f 1024 && exec timeout --signal=TERM --kill-after=5s 30s python3 -B -W error::ResourceWarning -m unittest tools.test_native_qa_authority_contract -v' > .ara-state/authority-adapter-design/portable-v2.log 2>&1
```

The proposal requires a fresh actual-target eligibility preflight, unchanged
three-file hashes, an existing log directory, a 35-second parent timeout and a
45-second total budget including preflight/readback/cleanup, with explicit slot
release. Failed setup/limits stop the attempt; no retry or extension is implied.
No v2 imports, compilation or tests have run at the source-freeze milestone.
No install, native test, calibration, provider operation or Mac action is part of
that command. Boundary Discipline shaped this design: validate external evidence
once, keep the matrix model pure, and never infer enforcement from valid data.

## References

- [Apple secure helper design](https://developer.apple.com/library/archive/documentation/Security/Conceptual/SecureCodingGuide/DesigningSecureHelpers/DesigningSecureHelpers.html).
- [Apple secure file operations and inherited descriptors](https://developer.apple.com/library/archive/documentation/Security/Conceptual/SecureCodingGuide/Articles/RaceConditions.html).
- [setuid real, effective and saved-ID semantics](https://manp.gs/mac/2/setuid).
- [Apple VZ disk attachment](https://developer.apple.com/documentation/virtualization/vzdiskimagestoragedeviceattachment.md).
- [Apple VZ auxiliary storage](https://developer.apple.com/documentation/virtualization/vzmacauxiliarystorage.md).

Archived guidance and constructor signatures support the design. They are not
runtime verification on Sven's macOS version or any other deployment.
