# Hidden chat shortcuts in a center terminal tab

Conductor Rebuild compared retained Conductor renderer evidence with OpenConductor main `a0a82a29e7dccee0ddb2fa530203ed711ab8e1e2` on 11 November 2026, then revalidated the relevant source at `4e0e9929de24b3a088f4851c05231fdcf0e882bf` after #960 merged. Fresh default-branch head `50b0a4403ee26d315775869b35958bfe28291ae2` has identical relevant workspace/keybinding source.

## Reference behavior

The retained same-build assets are:

- `index-BGEQ8YjU.js`: SHA-256 `b5b01f33fbbef68adcdda0de828a7735aebbf7f05f66f37e25333f3e1ed7dbf3`.
- `renderApp-D_fmY7hW.js`: SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The original-file owner read existing bytes on Cloud 4, without executing JavaScript or acquiring another artifact. Its complete application-join receipt has SHA-256 `f2787f85cbf0b0220631d8d36248b5ee0c5ef1c57c1a7cfd148597d1290b0bf6`. The handoff is retained in [the source Session](https://reasonmachines.com/agents/1a0b236e-24d0-4b7e-9045-81525f0bcd13), source `0c5971fe-756e-4c36-9e03-23d2c4842897`, revision `26196422`. It contains 58 full-text/range/hash records on that computer. This note records the relevant UTF-8 ranges, not a new extraction of the original app.

- `ITo [8655325,8691330)` registers `chat.cancel` at byte 8667263 and `chat.addAttachment` at 8682570.
- `JNi [8750085,8760369)` is its only renderer.
- `Nji [9703583,9704881)` renders `JNi` only when `(tab.type === "session" || isFocused) && sessionId`. Terminal tabs have no session ID, so their composer does not mount.
- Legacy `FYo [9745558,9749095)` also excludes `JNi` when the selected tab is a terminal.
- The original-file owner freshly rehashed both whole bundles, the complete receipt and the exact `ITo`, `JNi`, `Nji` and `FYo` ranges during caller integration. All matched the retained receipt, with unchanged originals before and after. This is retained-byte integrity, not execution of the original app.
- In a split layout, a session pane may remain mounted in another group. `Nji` supplies its focused boolean through `I_i`; `oi [2289518,2290390)` forwards it as `isFocusedScope`. `C8t [745353,746950)` excludes handlers whose scope is false before checking global/input/terminal conditions.
- Both shortcuts default to terminal-enabled. `chat.cancel` uses Command-Shift-Backspace; `chat.addAttachment` uses Command-U. The mount/scope rules, not a terminal-disabled registry flag, keep them off in a center terminal tab.

The same receipt closes the override-adapter installation caller and onboarding provider ancestry. `Aoa` has two registrations, not three. It is not under either the dialog-ID or focused-pane provider. The third onboarding registry command belongs to excluded cloud onboarding. Those joins do not require a timing, media, account, or cloud-UI change.

## OpenConductor defect and change

At the checked main commit, `WorkspaceView` keeps `ChatPanel` mounted under `hidden={centerTerminal !== undefined}`. Its composer registers cancel when the agent is working and attachment when a picker callback exists. Neither checks the hidden center-tab state. The root key listener runs in capture phase, before the terminal target's handler.

`KeybindingScope` supplies the existing dispatcher's focus flag through the React hook and binding resolver. Nested scopes cannot override a false ancestor. This preserves mounted draft state instead of unmounting the chat. Outside an explicit scope, behavior stays unchanged.

The #960 owner confirmed actual merge `4e0e9929de24b3a088f4851c05231fdcf0e882bf` and explicitly released `WorkspaceView` before caller integration. The retained chat host now supplies `focused={centerTerminal === undefined}` around the entire mounted `ChatPanel`. A center terminal disables its shortcuts without destroying the draft; switching back reenables them. A separate right-panel terminal does not disable the visible chat. The empty-diff regression file remains byte-identical, Git blob `642819e48e018c40f0b91725dd55245f5951f0c4`.

## Verification

The first test run on unchanged fresh-main binding/dispatcher source produced 20 passing tests and one intentional failure:

```text
hidden chat bindings cannot cancel or attach from a center terminal
Expected: pass
Actual: ran
```

The focused-chat control passed. The failure was a callback firing, not a TypeScript, dependency, or test-loader failure.

After scope forwarding:

```bash
node --experimental-strip-types --test \
  src/keybindings/bind.test.ts src/keybindings/dispatcher.test.ts \
  src/keybindings/resolve.test.ts src/keybindings/shortcut.test.ts \
  src/keybindings/listeners.test.ts src/keybindings/overrides.test.ts
```

Passed: 58 tests, no failures. The cancel and attachment regression passes; focused chat shortcuts remain eligible while the separate panel terminal has keyboard focus.

A broader local run of every existing keybinding test except the new React test was partial: 74 tests passed; `editor.test.ts` and `help.test.ts` could not load the absent `fuzzysort` dependency. No install was attempted. Those suites remain assigned to normal CI rather than reported as passing.

`src/keybindings/focusScope.test.ts` uses real React, the real registration hook, binding source, listeners and dispatcher. The window/document event boundary is synthetic and a small chat component stands in for composer UI. Two scope controls passed on checkpoint `319d46314542a40b0363e1fc087156da8d2b9a24`, along with hosted frontend typecheck/build; all 22 checkpoint checks subsequently passed.

The additive caller regression extracts and evaluates the verbatim `ws-chat-host` JSX from `WorkspaceView.tsx`, including the real `ChatPanel` props and wrapper, rather than copying its scope condition into the fixture. It is a bounded caller integration, not a full WorkspaceView/terminal/composer mount.

**Actual caller RED:** at test-first head `f6e4af83c04be1be5326cbe0e573d2a44076ad9c`, [frontend unit job 130230185246](https://github.com/reason-machines/openconductor/actions/runs/42931230821/job/130230185246) reported 2128 passes and exactly one assertion failure, case 1388. The scoped controls passed. After selecting a center terminal, callbacks were `['cancel','attach','cancel','attach']` instead of `['cancel','attach']`. [Keybinding job 130230184076](https://github.com/reason-machines/openconductor/actions/runs/42931230802/job/130230184076) independently reported the same intended failure. The frontend typecheck also exposed a separate missing compiler-module type annotation in this new test helper; that was corrected before the caller wrapper. Build-dependent jobs failed on those same test-helper type errors, not on another product defect. No assertion was relaxed.

The corrected regression file is locked at Git blob `44f7989b4a83dd69245fb0b4e2dd18b75fd0f47b`. Its assertion semantics are unchanged from the observed RED; the only intervening test change typed the existing TypeScript import to preserve AST narrowing. Caller GREEN, full typecheck/build and all exact-head checks remain assigned to the unchanged normal CI jobs, not claimed from local syntax/pure tests.

Not run locally: full typecheck/build, React integration execution, browser or native-app rendering, terminal playback, provider operations, authentication, acquisition or analyzers. There is no screenshot because this is a source-only lane with no app/native runtime admission. Static provenance and pure tests are not native acceptance. No dispatcher semantics, registry/schema, lockfile, workflow, native code, local-provider architecture, #847 or #916 changes are part of this patch.
