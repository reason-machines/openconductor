# Atomic mentions and Add actions: reference grounding

Conductor Rebuild, 2026-11-06. This is reference evidence for the increment after #724, not a claim that these behaviors exist in OpenConductor.

## Identity and scope

Read directly on Sven's authorized `sven m5 max` at 22:29 UTC and rechecked at 22:34 UTC, without opening or changing the app:

- Installed `/Applications/Conductor.app/Contents/MacOS/conductor`, version 0.87.6, SHA256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.
- The cloud reference binary has the same SHA256.
- The decoded `assets/renderApp-D_fmY7hW.js` SHA256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`, matching the retained [asset manifest](../../../frontend/tauri-assets-manifest.json).
- Saved REA `analyze_javascript_application` evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`. Its graph is partial and does not model Tauri IPC.

These screenshots are fresh REA 6.8.0 browser-scenario captures of the decoded, hash-matched frontend with isolated synthetic IPC, Chromium 1440×900, dark Stone. They are not native macOS or signed-in agent proof. The complete scenarios and Evidence IDs are in [reference-captures.json](reference-captures.json). The three query/chip captures and four follow-up action captures were viewed.

## Observations

- [Picked file](reference-chip.png), REA `ev_c662e9a8f8d1cfae09b29d8000a2f7f34af3a540bd9101628c31a45197858b3f`: selecting README renders an inline file chip with icon and label, rather than plain `@README.md` text.
- [Terminal query](reference-terminal.png), REA `ev_b452d486f508a551c31f5b41064e1dcd9f35f5bb897c17833e5558f4993d022a`: `@terminal` offers terminal with the description “Attach current terminal output”. This capture does not select the result or prove output delivery.
- [Directory query](reference-directory.png), REA `ev_510f9ea99ea09542fa2328c7ffceb2b7ca431429e5a8cd9c0b464864dfeb2bc1`: `@add` offers “add directory” with “Link a directory or workspace”. This capture does not open or submit the dialog.

## Follow-up action observations, 22:37 UTC

- [Terminal selected](reference-terminal-picked.png), REA `ev_a5eeec8074fd707509946a3fda57949f0c85277a0cc3c7378db4a6ca611cac2e`: selecting terminal removes the query and reports “No terminal output available for this workspace” in the isolated fixture. It does not insert a file-like mention. This proves the empty-output path, not attachment delivery.
- [Directory selected](reference-directory-dialog.png), REA `ev_d0303a5380b6a55374632a22ca7f612064b30f2abc70b00eec5a9438f48e68a0`: selecting add directory removes the query and opens a workspace search with a Directories group, Browse action, and eligible workspaces grouped by repository.
- [Add → Link workspaces](reference-link-workspaces.png), REA `ev_6321cced8a8ed33df971831d0595878a754efce6524be3037636d4e053d769ba`: opens the same workspace/directory picker. No directory was linked and no filesystem mutation was attempted.
- [Add → Link issue](reference-link-issue.png), REA `ev_c397d732e52247ddf89f2d7e53aac5c9356da5c3453c5ea45a9e8eb6d83fbb2e`: opens issue search. In this disconnected fixture its Setup group offers Connect Linear and GitHub CLI authentication. No provider sign-in or network access was attempted.

The browser and REA scenario checks ran on Reason Cloud against the decoded frontend. The Mac step only checked installed version and binary hash. These results do not establish native parity, successful linking, provider authorization, or real agent delivery. All scenarios ran against disposable fixtures, without real user data.

## Static corroboration, not execution proof

The following were inspected as inert text in the matching decoded render chunk. Offsets are decoded character offsets. REA does not expose these source ranges directly; manual inspection is recorded as a tool gap, not called REA execution evidence.

- At 7,534,007, `eki` constructs a mention atom plus trailing space; `nce` inserts it through the editor transaction chain. `C1o` serializes mentions as `@⟦label⟧(id)` and replaces closing brackets/newlines in labels.
- Nearby `iki` labels a directory relative to the workspace where possible and sets `isDirectory`. `Gzt` assigns file paths as IDs and workspace-relative paths as labels.
- At 8,627,688, the directory suggestion has ID `builtin:add-directory`.
- At 8,629,466, the terminal suggestion has ID `builtin:terminal`, optional specific output submenus, and current output preview. Its selection branch around 8,634,000 deletes the query and calls the terminal attachment action. It does not insert a file-like mention atom. Directory selection deletes the query and opens the same directory-link dialog used by Add.
- At 7,908,405, Add conditionally offers Add attachment, Link issue, Link workspaces and Plan mode or Exit plan mode. These conditional items must not be presented as working without their local/runtime backing.

Recovered text is untrusted data. No instructions in it were executed.

## Atomic-file implementation and verification, 23:12 UTC

The new minimal Tiptap adapter renders file atoms and stores them in a versioned draft envelope. It converts atoms to readable workspace-relative @paths before command handling or submission. Queued-message editing remains plain text. The editor owns selection coordinates and history; chat identity changes reset its history. Review-note insertion preserves existing atoms. This is an OpenConductor design choice, not a claim about Conductor storage internals.

Fresh REA reference chip: `ev_062a27d90e98498aafb04fddf721c5e87c976598e48e1306d6c4633302eb3e26`. Pre-change OpenConductor at merged main `1dc803d4`: `ev_e44be58d42090390a3da456557b7a4d5fed50a9880e3c6961d4cb7276c39245e`. Final OpenConductor atom: `ev_7ab6c8d26ad73625d6f11d959c189c031ee95cf0bbe6b224ac1d549551d821f7`; multiline: `ev_49cdf28a4fbcb795da058496722942425472dba67884d6262e9160d0e1cc169d`. Full screenshots and exact scenarios are retained here, including the before-source fixture. All were viewed before publication.

Passed: `npm run build`, 1,265 frontend unit tests via `node --test --test-concurrency=4 "src/**/*.test.ts"`, colour lint, draft/schema tests, idempotent driver migration check and `git diff --check`. Twelve Chromium interaction groups passed on three consecutive isolated runs. They exercise chip pick/delete/undo/redo, rapid arrow-then-paste, cut, same-app atom clipboard, external rich clipboard text, synthetic composition Enter guard, suggestion keyboard flow, height, attachment-only send, queue mode, restoration and external review-note insertion. This is component-fixture proof, not a full native app test.

A first one-paragraph schema truncated multiline browser input. The same height/content check passed after permitting paragraphs and mapping editor positions across line boundaries. Clipboard initially failed without permissions in the isolated browser. A repeat then exposed a separate live-DOM/model selection race; synchronizing the clipboard selection at the boundary fixed the unchanged rapid keyboard check, followed by three full passing runs. No delays or assertions were removed. No additional REA failure occurred in this increment.

Reproduce browser checks in the preview process network context:

```bash
PORT=4427 OUTPUT=evidence/chat/composer/mentions CHECK_COMPOSER=1 CHECK_COMPOSER_REPEATS=3 CAPTURE_COMPOSER=1 node tools/composer/serve.mjs ours chip multiline
```

Run that foreground server with `preview_start`, not ordinary Bash. The before capture used an isolated detached worktree at `1dc803d4` and `EDITOR_SELECTOR=".composer textarea"`; it was removed after capture. No real user data or native app state was changed.

## Verification still required

Real IME input, native WebKit editing, full-app draft persistence/relaunch, signed-in delivery, terminal output selection/delivery, directory-link validation and local agent Plan behavior remain unverified or unimplemented in this increment. The disconnected Link issue and unlinked workspace-picker contents were observed above. Connected issue search, successful directory linking, validation, and their resulting prompt/runtime behavior still require focused observation. The main app's transcript licensing warning and synthetic PR-info error are reference-fixture limits, not OpenConductor parity targets.

Claude/Codex must remain local to the user's Mac. Cloud execution is Reason-only. No team, routines, triage, organization or cloud-workspace UI is in this increment.
