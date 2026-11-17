# Retained hosted hard-link failure

[Run 43126168216](https://github.com/reason-machines/openconductor/actions/runs/43126168216)
failed at `5852f41eb4df5c6da9b976d7b8ef830a892aed8d` on macOS 15.8.2,
kernel 24.6.0, arm64. The caller was runner UID/EUID 501 and GID 20. The
consumer was the existing daemon UID/EUID/GID 1. No working-Mac result is inferred.

`observations.json` preserves the original artifact bytes. SHA-256 is
`f22215f4bd631259dfd608e39ad750571145c4b57fe7856e95d692ba05676727`.
The original artifact was `13903092009`, from job `130878667156`, attempt 1.
Its ZIP SHA-256 was
`c158b939f93a0bed27b61f06a1dd31ba5eab1efcaa2e4203d4856c1ab0359444`.
The source owner matched the ZIP member bytes to this file and verified all
16 payload hashes in E1's sealed failure packet. That packet's SHA-256 was
`1a26e990947474092ceb6dc456fdba1db78053dd2ed50a304c54c36b7486f3f5`.

## Observed failure

The consumer initialized both exact objects and completed both read/write
controls. The initial caller observed eight EACCES denials but successfully
created one hard link to each protected marker. Both link results are BREACH,
not denial. Both later reopen attempts were unavailable because each original
inode now had more than one link. Final consumer verification was attempted
and exited 2 on the same single-link invariant.

The packet contains five invocations and one before-caller snapshot. It has no
after-caller snapshot and no execution of the later four labels. This incomplete
sequence cannot qualify as a complete five-label observation. Successful link
creation does not establish writable access through the aliases.

## Correction and limits

Version 1 placed mode-0600 markers directly in a searchable mode-0755 directory.
The version 2 correction places them under a consumer-owned mode-0700
`resources` subdirectory, pins that directory in the plan, and preserves actual
caller syscall attempts through the public parent. Consumer measurements retain
the original object and single-link checks. The controller labels those resource
snapshots as consumer reports, not independently readable caller measurements.

The portable regression failed before the correction with `FileNotFoundError`
for the missing `resources` directory. A real, same-UID writable-twin hard-link
control also reproduced the retained-alias and single-link refusal mechanism.
Neither portable result proves cross-UID macOS enforcement. The corrected
hosted roles remain NOT_RUN until a new bounded unit is separately reconciled
with E1, the sole executor. There is no automatic retry or repair of this run.

Runtime admission and native admission remain false. All 60 native lifecycle
cases remain NOT_RUN. This record grants no dispatch, provisioning, escalation,
service, VZ, GUI, or working-Mac authority.
