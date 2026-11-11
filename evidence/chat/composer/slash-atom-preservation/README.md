# Slash completion preserves suffix file atoms

Conductor Rebuild. Packet `ACQ-COMPOSER-ATOM-01`, captured 2026-11-11.

## Finding and scope

The retained Conductor renderer replaces the slash suggestion range inside the editor. OpenConductor main `26ba01a1857a425780252abe3d28aa4eb9ba9572` instead turns the entire linear selection snapshot back into plain text. That snapshot represents each file atom as U+FFFC, not its original node and attributes. A slash completion can therefore lose file identity or drop an adjacent suffix atom.

The source finding was rechecked on main `6be97d85b854b2a1bf7930db49e2227a26af2e6a`. Its slash caller and editor adapter still contain the whole-document plain-text replacement above. Hosted mounted-fixture execution is partial, as recorded below. Browser behavior, native WebKit, visual parity, real IME, and provider delivery have not been verified.

The change is limited to `Composer.tsx`'s slash-choice caller and the range-insertion handle in `ComposerEditor.tsx`. Existing paste, input attributes, selection restoration, mention actions, ModelPicker, and their locked fixtures are unchanged. Immediate built-in command effects and sibling skill hypotheses are outside this increment.

## Artifact identity and REA limits

- App lineage: Conductor 0.87.6. The retained decoded renderer is `assets/renderApp-D_fmY7hW.js`.
- Renderer: 11,600,457 UTF-8 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`.
- Retained REA evidence: `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`, in [the saved JavaScript analysis](../../../frontend/rea-analyze-javascript-application.json.gz).
- [The asset manifest](../../../frontend/tauri-assets-manifest.json) and [the earlier atomic-mention packet](../mentions/README.md) record the matching artifact lineage.
- REA inventoried this renderer but skipped parsing it after its JavaScript worker exhausted the heap. The declarations below were read as inert compiled JavaScript. They are not an REA-generated call graph or runtime observation. No new REA invocation failed in this increment.

[The complete packet](packet.json) retains 17 declarations or assignments, their hashes, the checked main files, the chain, and all coordinate systems. It includes full `ITo`, `lHt`, `o5o`, `u5o`, `b5o`, `w5o`, `E5o`, `C5o`, `DIi`, `k5o`, `eki` with `nce`, `BNi`, `D5o`, `O5o`, `a_o`, `Ybo`, and `nqn` ranges.

## Declaration, immediate caller, and visible consumer

1. `ITo` builds `h_`, including the `/` trigger, query `z6`, and `onSelect`. Its normal command branch calls `insertContentAt($r, /name + space)`. Its immediate built-in action branch calls `deleteRange($r)`, not a whole-document delete.
2. The visible `ITo` composer renders `lHt` with `triggers:h_`, `value:g`, and `onChange:X`.
3. `lHt` installs `D5o` suggestions and forwards each editor, range, and picked item into `Q.latestTriggers[xe].onSelect`.
4. `u5o` matches the text immediately before the caret. `b5o` requires an editable empty selection or composition and retains the match range. `w5o` forwards that range to the suggestion renderer.
5. `o5o` retains the editor and range on start and update. Its selected-item command invokes the callback with those same objects. Enter and Tab reach that command.
6. `a_o`, Conductor's bundled `insertContentAt`, applies `insertText` or `replaceWith` only between the supplied positions. `Ybo` deletes only its supplied range. Neither branch recreates suffix nodes.
7. `k5o` defines an inline atom. `D5o` binds it to `O5o`, which renders the visible mention pill. Suffix file nodes therefore stay connected to the visible editor consumer when the bounded transaction leaves them outside the replacement.

The chain proves static reachability and the transaction boundary. It does not prove that a native user performed the interaction this turn.

## Exact selection and replacement units

Bundle offsets in the packet are zero-based, half-open ranges. Each span records Unicode code points, UTF-8 bytes, and JavaScript UTF-16 code units separately. None is a ProseMirror editor position.

Editor ranges use ProseMirror document positions. Text uses UTF-16 code units and an inline atom occupies one position. In the first paragraph, `/re` at the caret maps to `{ from: 1, to: 4 }`. A following file atom starts at position 4, outside the half-open replacement. The inserted `/review ` has length 8, so the resulting caret is position 9. A pre-existing suffix space stays intact, even when this yields two adjacent spaces.

OpenConductor's `linearDocument` supplies the mapping from linear offsets to editor positions. The fix uses that mapping to replace only `{ start: 0, end: current.start }`, after validating the live slash query and empty selection. It keeps the existing composition guard. No suffix atom is converted to U+FFFC text or reconstructed from a label.

## Source checks and execution

Passed: [the static packet verifier](verifier.py), 23 assertions, against the retained renderer and exact main above. This reads source and hashes only. It does not execute the target.

```bash
python3 evidence/chat/composer/slash-atom-preservation/verifier.py \
  .rea-work/reference-retained/renderApp-D_fmY7hW.js \
  --main 26ba01a1857a425780252abe3d28aa4eb9ba9572 \
  --output evidence/chat/composer/slash-atom-preservation/packet.json
```

[The new regression](../../../../src/features/chat/composerSlashAtoms.test.ts) is written before the product fix. It mounts the actual Composer with a test editor boundary, then invokes the production adapter handle against a headless Tiptap editor. DOM focus is replaced with a no-op. It covers adjacent and spaced suffix atoms, multiple files, multiline Unicode text, Enter and Tab, agent-specific insert text, and stale or nonempty selections. It is not a mounted browser editor or native proof.

Before publication, baseline RED, patched GREEN, nearby regressions, and local typecheck were not run. The single-worker Cloud Node slot was queued. Its publication-time receipt reported 5.7 GiB free at 96% disk use, load 14.79 on four vCPUs, and no idle CPU. Dependencies were not installed. No server, browser, native app, or provider was started.

### Hosted failure and test-oracle repair

[Hosted CI at head `4f6559e71e4a4bf109befb11521f67a7e815ece0`](https://github.com/reason-machines/openconductor/actions/runs/42969027487) ran all eight new mounted cases. Five passed. The three full-document comparisons failed because the expected JSON had plain-object attributes and separate adjacent text nodes. ProseMirror uses null-prototype attributes and joins adjacent text. The failure diffs retained the expected file attributes, whitespace, and suffix text. Both frontend jobs failed on these same three assertions. The typecheck step passed, and the frontend build was skipped.

The oracle now constructs its expected document through the editor schema, which joins adjacent text nodes and supplies canonical attributes. It still compares the complete document JSON, including every text character, hard break, file path, label, directory flag, and node order. Additional strict equality assertions require every suffix file node instance to survive the transaction. Existing caret and empty-selection assertions remain unchanged. No product code or locked fixtures changed in this repair.

Local dependencies remain absent. The fresh request for one bounded install, focused baseline RED, patched GREEN, and typecheck is queued with the existing serialized executor. No passing result is claimed for the repaired oracle yet.

The intended baseline and patched checks run the same repaired test:

```bash
COMPOSER_SLASH_SOURCE_REF=26ba01a1857a425780252abe3d28aa4eb9ba9572 \
  node --test --test-concurrency=1 src/features/chat/composerSlashAtoms.test.ts
node --test --test-concurrency=1 src/features/chat/composerSlashAtoms.test.ts
npm run typecheck
```

No declaration or caller artifact is missing. The remaining tool boundary is current capacity admission for this one lightweight Node fixture, followed by actual execution. The sole serialized executor owns that queue receipt. No new native acquisition is needed for this source finding, and no acceptance is inferred from the queued state.
