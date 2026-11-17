# Claude Auto permission policy: source-qualified repair

Owner: Settings/SAME49. Baseline checked: `91de35a7e10199675bc43d9b29516cd8ec18f4a0` (main, 2026-11-17).

## Source and scope

`reference.json` contains 14 inert literal spans (byte offsets, lengths, SHA-256s)
from the already-retained Conductor 0.87.6 sidecar. Its complete 13,025,924-byte
bundle hashes to `f72df80a11d76bacb7ed7e2a322b420e6250b4a2c7781272877b8c5cf985e6ab`.
A fresh read on Sven's Mac established that every bundle byte occurs at offset
62,734,375 of the retained 76,147,184-byte original Mach-O, SHA-256
`5723ead40316bb29e3d0b446cdc82bede489cc75443d6ce08a4e6421ae6eac0d`.
That is the subject of the existing REA receipt
[`search-strings-runtime-skill.json`](../../packaging/rea/search-strings-runtime-skill.json),
evidence id `ev_5c7da8ff0653a7bc1b12da0a7e7c908edc1e25a1bcd11dffb16d454c84e23e2b`.

This is an exact same-build static binding, **not** REA semantic execution or
mounted behavior. No vendor code was imported/evaluated, no original app or
provider was run, and no new acquisition was performed. The retained REA index
does not itself expose this Bun selector/caller chain; exact embedded-source
readback closes that source gap, not the runtime acceptance gap. The original
receipt and its limits remain unchanged.

The pinned chain is the validated `$Z` query request (`n58` options), `gp5`
handler, `BT4` option-to-config mapping, `OO` config schema, `Mc3`/`zn4` final
selector, and `CB5`/`Rc3` live reconciliation. `gp5` applies explicit initial
Claude mode only without an existing sidecar session; resume is a separate
option. The retained selector gives Plan precedence, then bypass when approvals
are off, then Auto when the boolean feature is on, otherwise Default. Reused
queries reconcile that policy before their message is sent.

The approved `ExitPlanMode` callback separately returns both `_targetMode` in
`updatedInput` and `updatedPermissions: [{type: "setMode", mode, destination:
"session"}]`, selecting the non-Plan policy from current configuration.
Nonapproval remains a denial. The packet deliberately contains only the relevant
callback excerpt; unrelated plan-file/worktree enrichment is not claimed here.

## Defects and smallest complete fix

- `claude_launch` ignored the enabled experimental Auto flag.
- `claude_prompt` overwrote permission mode every turn using an approvals-only
  helper, so a launch-only repair would not work.
- Approved plans persisted the chat's opt-out from Plan but returned plain
  `Allow(input)`, with neither same-turn policy field.

The central settings selector now serves launch, per-turn mode and approved-Plan
restoration. Chat Plan state still wins over settings; the initial default does
not override an existing chat's explicit opt-out. Review launches ignore the
chat-only initial Plan default. Missing/nonboolean Auto values remain off.

The Plan reply reads current settings under the existing logical-chat gate,
preserves the persist-before-reply/rollback path, and changes the wire policy
only for a pending `ExitPlanMode` explicitly approved with a Plan answer. The
interaction helper rejects Plan/acceptEdits/dontAsk restoration targets and
malformed Plan inputs. It never adds a mode to ordinary tools, cancellation,
rejected plans, questions, Reason ACP or Codex. Existing ask validation occurs
before a pending request is consumed. No provider/runtime admission changed.

## Reproducible pure checks

Run from the repository root:

```bash
python3 evidence/settings/auto-permission/verify-reference.py
python3 evidence/settings/auto-permission/run-tests.py --source-ref 91de35a7e10199675bc43d9b29516cd8ec18f4a0
python3 evidence/settings/auto-permission/run-tests.py
python3 evidence/settings/auto-permission/run-tests.py --filter interact_tests::
python3 evidence/settings/auto-permission/run-tests.py --filter agent::claude_stream::tests::
python3 evidence/settings/auto-permission/run-tests.py --filter launch_policy_case::
git diff --check
```

The baseline command is expected to fail assertions: **6 pass / 7 fail**. The
same 13 frozen fixtures on the repair pass **13/13**. Fixture hashes:
`regression.rs` = `53aa4786ec30c3b9028dae1f19819ecf216c0cba0e7581a098139b2516c3d5df`;
`protocol-regression.rs` = `d0e8b6051edd853e178c305fa1ef81db9dda6b6ed6eec853d325a0ad8063ba04`.

Earlier isolated milestones remain separate in logs: the original nine policy
cases went **4 pass / 5 fail → 9/9 pass**. After that repair but before protocol
changes, the combined protocol run was **11 pass / 2 fail → 13/13 pass**. The
new same-turn Plan result is not retroactively attributed to the nine policy
cases. Permanent interaction tests pass **7/7**, existing stream protocol tests
**6/6**, and the permanent launch matrix **1/1** (8 flag combinations × 2
purposes × 2 resume-argument states, plus explicit Plan/Default controls).

The harness compiles actual agent/model/launch/interact sources. The per-turn
assignment and runner decision call are copied verbatim into small pure adapters;
five provider DTO declarations are also copied verbatim. The DB's Plan/Default
enum is an adapter. Only the named pure filters above ran: other compiled tests
that start fixture processes did not run. Test extraction and Git snapshots
never modify the checked-out production source. Dependencies are ordinary Rust
packages; no agent executable is invoked. The generated Cargo graph lives under
ignored `.oc-tmp`, not the app's workspace.

## Acceptance gaps

Full Tauri compilation/native test execution, SQLite command/rollback integration,
live CLI protocol consumption, actual resumed/reused process reconciliation,
package/install identity and mounted native behavior were **not run**. The
resume launch matrix only proves generated arguments; it does not prove a live
resume. The static source verifier only proves pinned literal contracts, not
runtime behavior. The new regular Rust tests run under the repository's manually
admitted app test workflow; this change adds no workflow or dispatch. Automatic
frontend CI does not compile this Rust path. There is no UI/screenshot claim or
new cloud UI. Existing package/native ownership and the E1 boundary stay separate.
