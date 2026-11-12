# Local Fast frontend regression preparation

Conductor Rebuild prepared this bounded test-only unit against main `f55d0330ff32e790c08a26d2e7aa83dbf2b8ea32`, then revalidated all eight source pins against actual merged main `6dbbc4fc3a08ede3d98b6d14811b018a929015e7` after #1111. The retained complete asset hashes and thirteen UTF-8 windows also passed static integrity checks on Reason Cloud. None of this unit's tests has executed. No product RED or GREEN is claimed.

## Scope and frozen oracle

The retained Conductor 0.87.6 source record is [source.json](source.json). Its evidence ID is confirmed by the tracked [REA directory-analysis record](../../frontend/rea-analyze-javascript-application.json.gz), not just a generated summary. The two complete asset hashes and thirteen exact UTF-8 windows distinguish model capability, provider identity, the disabled unsupported control, the non-ACP picker branch, conditional `/fast`, and the existing session mutation. The `gZ ← jK ← Kc` import/export join is included. This is retained Conductor 0.87.6 static evidence, not fresh installed-app extraction. Renderer parsing was skipped and index parsing was partial. The original native-sidecar translation and already-live retuning remain unknown.

The positive local identities are Claude `opus-5-1m` and Codex `gpt-5.4`, each with effort `high` and Fast initially off. Recognized unsupported controls use Claude `sonnet-5-1m` and `haiku-4-5`. Reason controls use the same raw Opus/Codex model IDs with explicit Reason identity; they must not inherit local capability. Cursor and third-party ACP implementations are outside this unit.

The original unsupported local Fast row is disabled, not necessarily absent. The original ACP branch has no local Fast row. A matching raw model string alone is not provider identity or entitlement.

## Prepared tests, not results

- `src/features/chat/localFastMode.test.ts` defines ten pure controls for recognized model capability, existing Fast storage round-trip, explicit Reason/local identity separation, conditional command construction and agent-reported precedence. Direct constructor/storage tests are not mounted picker or workspace-dispatch proof.
- `tests/chat-search/composerLocalFast.dom.test.mjs` defines twelve mounted cases. The two supported identities each cover picker on/off persistence, the actual editor-to-Workspace `/fast` callback, and an agent-reported command precedence control. Two unsupported models separately require the disabled row and exercise command rejection without writes or delivery; two explicit Reason identities must have no local Fast control or mutation. Unsupported row presence is a parity RED candidate, not a passing safety control.
- `tests/chat-search/support/localFastHost.mjs` loads the actual `ChatPanel` body from the whole Workspace module, `ChatModelPicker`, `ModelPicker`, `Composer`, Tiptap `ComposerEditor`, `useLoadout`, saved-agent and model-choice producers. It adds only an export for the internal panel entry; it does not rewrite its body, inject `fastSupported`, copy an eligibility gate or invent an option key.
- The host uses a complete settings object with global Fast off, inert settings/catalog discovery, in-memory draft/choice stores and a recording `agent.submit` boundary. Native commands, providers, attachment IPC and unrelated actions throw. Surrounding workspace UI, animation, tooltip rendering, global keybinding registration and native event transport are replaced. The ordinary Enter event still reaches the production editor and Composer handlers.

A picker toggle must write the existing saved choice once and preserve model, effort and agent identity. The app-owned `/fast` route must mutate once and deliver zero agent prompts. A reported `/fast` remains an agent command and must deliver exactly once without a configuration mutation. Unsupported models cannot enable Fast; Reason must not acquire the local control.

## Hosted qualification protocol

#1111 is confirmed merged in main `6dbbc4fc3a08ede3d98b6d14811b018a929015e7`, and the same Session has integrated that main. This separate ready, main-based PR contains only this unit's tests and evidence. The #1111 four service controls, 72-case matrix, helpers and evidence remain byte-identical to main. No workflow or dependency change, new publisher, manual dispatch or local runtime is part of this unit.

The existing automatic frontend workflow discovers the TypeScript unit through `node --test "src/**/*.test.ts"`. Its existing DOM step supplies `ONBOARDING_DOM_DEPS` and discovers `tests/chat-search/*.dom.test.mjs`. Focused reproduction commands, not run here, are:

```bash
node --test src/features/chat/localFastMode.test.ts
node --test --test-reporter=tap tests/chat-search/composerLocalFast.dom.test.mjs
```

`python3 evidence/chat/local-fast-mode/verify_source.py` passed on Reason Cloud. It checks the pinned baseline source, REA record identity, thirteen source windows, available full assets and the three test files. It does not execute product code. The three test and host files are frozen in [fixture.sha256](fixture.sha256) before hosted execution. Actual TAP names and nonzero counts must be read back. Expected candidate failures are the eligible picker/command assertions and unsupported-row assertion, not imports, globals, loader errors or missing DOM mounts. Report each actual failure; do not pre-credit the planned twelve mounted cases. Six parity cases are expected RED candidates; the other six are independent safety/precedence controls, whose passing execution remains to be observed. Controls must execute and pass before any behavioral failure is qualified. Freeze fixture bytes through any later intended RED/GREEN comparison. No production edit is authorized by this document; a future shared-file change needs the exact handoff and an established application contract.

## Verification limits

No tests, typecheck, build, application, browser, provider, CLI, database, native session, real IPC or manual workflow dispatch were run for this unit. Static file hashes are not behavioral verification. There is no screenshot because this is unexecuted jsdom preparation, not rendered pixels or a visible app change.

A read-only source review found no definite bootstrap blocker but identified an unfocused command driver. The host now focuses and checks the real contenteditable, pastes completed `/fast `, then sends ordinary Enter. This exercises submitted-text command ownership, not conditional slash-menu visibility or suggestion selection. A second source read confirmed that the trailing space closes suggestions and submission trims the command to `/fast`. The remaining setup-failure cleanup gap is addressed with shared disposal for both failed setup and normal close; if cleanup also fails, both errors are preserved. None of these source-review corrections has been executed.

The host does not exercise conditional slash-menu visibility/selection, global Fast keyboard shortcuts, tooltip appearance, external loadout updates, first-open/cold-resume Fast application, already-live retuning, provider acceptance, or original-app visual/native parity. Existing global Claude `fastMode` and Codex `service_tier` encodings are constructor-level source facts, not an established per-chat backend contract. No Reason Fast support, cloud Claude/Codex path, credential handoff or new provider-facing field is inferred.
