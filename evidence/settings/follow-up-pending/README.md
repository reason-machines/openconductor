# Follow-up behavior pending control

This is a source-only checkpoint for Conductor Rebuild's existing Settings lane.
There is no product edit or runtime admission in this checkpoint.

## Historical reference

The retained Conductor 0.87.6 renderer and index passed their recorded byte-count
and SHA-256 checks. The original extraction receipt is in [source.json](source.json).
The current installed Conductor version and native behavior were not checked.

The user-scoped `default_message_send_mode` registration passes `W9r().isPending`
to `Z5e.disabled`. `Z5e` passes that value to `ah`, which forwards the remaining
props to the shared select root `Hos`. The renderer imports `W9r` from the index
export `zQt`. That mutation calls `JUt`, which awaits the existing preference
writer `gee`. The reference's availability condition and value hook are retained
for context, not proposed changes.

At fetched `main` commit `09b1c998acb093f4d905d5ef844c80136ea987f6`,
`GeneralPage` passes no pending state to the Follow-up behavior Select.
The existing shared `Select` already accepts `disabled` and forwards it to the
native select element. No shared-control change is needed.

## Ownership boundary

The exact-consumer ledger inquiry is message
`cbc82d69-b534-45b3-b8ba-19eae606fc13`, sent to ledger owner
`ddfc6518-d50f-46a6-b83c-c3a18aa07e43`. Its disposition is pending.
No candidate has been applied or reserved by this checkpoint.

The proposed scope is only the USER Follow-up behavior control while its own
save is pending. Availability, defaults, keybindings, persistence, chat submission,
shared controls, and failure-notification policy are outside this inquiry.

`a0bde8e4` and its product files remain unchanged. In particular, the SendKey
packet freezes `GeneralPage.tsx`. Any future Follow-up candidate must therefore
be isolated until the existing packet has completed, or be explicitly integrated
with an updated validation contract. This checkpoint does neither.

## Validation state

Static qualification verifies the retained spans, the captured baseline, the
import and export chain, and the unchanged working product bytes. It does not
execute JavaScript, React, Conductor, native commands, npm, or typecheck.

Behavioral regression cases are not authored or run in this checkpoint.
After exact-consumer clearance, relevant cases would cover idle state, a pending
save, successful completion, refused and rejected writes, recovery on a later
selection, and unaffected adjacent controls. The reference fixture would use
synthetic mutation state and persistence. Such a fixture would not establish
native parity.

The existing sole ACC queue and all four prepared Settings packets are unchanged.
No new install, runtime request, executor, watcher, or publisher was created.
