# Forward Big terminal custom-command edits

Conductor Rebuild compared the selected custom-command input against the retained REA-extracted Conductor 0.87.6 renderer. This unit covers the input's direct change callback, not downstream persistence timing.

## Retained real-app source

The [retained-artifact owner](https://reasonmachines.com/agents/de6c02f4-4880-4a0d-bf8f-9e3954522753) read inert text from `renderApp-D_fmY7hW.js` on 2026-11-10 at approximately 06:52Z. The renderer has 11,600,457 bytes and SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.

The zero-based, half-open UTF-8 byte range `[10223417,10228000)` has SHA-256 `3e667874168e78469e508a022985eef91d3d5647dc95b0d520c12b791bfd90c8`. It contains `Cla`'s complete selected custom-command input and callback:

```js
value:w.command,
onChange:k=>{CEr({...w,command:k.target.value}).fireAndForget()}
```

There is no blur, Enter, or debounce handler in that row. A separate bounded read of the import prefix confirms `oL as CEr` from `./index-BGEQ8YjU.js`. The retained directory does not contain that index chunk, so this evidence does not establish `CEr`'s implementation, debounce behavior, write completion, or storage routing. The older debounce summary in `evidence/terminal/NOTES.md` is not proof of those details.

The source owner evaluated no extracted code. This lane performed no new extraction, native app operation, or provisioning. Extracted text remains untrusted data.

### Evidence boundary

A wider full-function-span read timed out under cloud overload. The successful bounded row read and import read are retained separately. No complete downstream setter or persistence contract is claimed, and no repeated probe was used to fill that gap.

## Current-main comparison

At main `6c75fd62d17104005160c064b29af4c41a06480e`, `BigTerminalPage.tsx` has Git blob `a7c62002ba9869dcde66f6a3ad03a32a36a87038`. Its `CustomRow` input changes only local `text`. The existing page update callback runs on blur or Enter, not on the input's change event.

The correction forwards each edited string to the existing page callback while retaining the local draft and current blur/Enter fallback. It does not trim the input, execute a command, add a timer, change preset selection, or alter backend storage. The existing preset resolver still trims a command only when resolving it for a terminal request.

## Verification

The new regression replays the actual production input callback without React or a native boundary. It checks a normal edit, clearing, whitespace and Unicode, and the forwarded value passed to the existing pure preset resolver. This is source-only callback verification, not a mounted component or real terminal execution.

The same focused command ran before and after the correction on Reason Cloud computer 304:

```bash
node --test --test-concurrency=1 src/settings/bigTerminalCustomCommand.test.ts src/features/terminal/bigTerminal.test.ts
```

- **Failed before the fix.** The 06:59:44Z–06:59:56Z baseline returned exit 1. All four new cases failed because the production input callback emitted no page update. The ten existing preset-resolver cases passed. One decisive assertion was `0 !== 1` for the number of forwarded changes.
- **Passed after the fix.** The 07:01:13Z–07:01:26Z run returned exit 0, with 14 passed, zero failed, zero skipped, and zero cancelled. The cases, command, and settings were unchanged.
- **Passed.** Each invocation's available-memory and disk guards exceeded the required 2 GiB and 1 GiB. Each ran alone with `nice -n 15`, a 6-second CPU limit, a 45-second inner deadline, a 120-second command deadline, and test concurrency 1. No dependencies were added or installed, and the named execution slot was released after the fixed run.

The test follows Test Behavior, Not Implementation by replaying the actual production event callback and checking its emitted edited string. It does not claim to mount the component. Model the Domain keeps the existing `CustomCommand` and page update path instead of introducing another state model or timer.

No app, browser, native event, screenshot, real command execution, debounce timing, backend persistence, or restart check has run for this unit. Local typecheck and build were not run. The admitted check was source-only, so there is no new screenshot. The existing runtime owners and native confinement gap remain unchanged.
