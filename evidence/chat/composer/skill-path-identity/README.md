# Picked Codex skills keep their selected path

Conductor Rebuild. Checked default branch `bc2a476d70d0b731be243f0422d99013a96d39f3` on 2026-11-12.

## Failure and fix

Two enabled Codex skills can share a name and display label but have different paths. The menu keeps both because their IDs include their paths. Before this fix, `skillCommand` inserted only `$name`. `linkCodexSkills` then chose the first skill with that name, even when the user picked the other row.

The fix changes only Codex's `skillCommand.insert` to `[$name](path)`. The existing send converter leaves an explicit reference alone. The existing Rust `skill_links` parser turns it into `$name` text plus the selected `{type: "skill", name, path}` input. Claude Code and Reason keep their existing `/name` insertion. Typed bare `$name` keeps its existing first-match rule.

This uses OpenConductor's existing supported prompt-link grammar. It does not claim Conductor uses that draft representation. No parser, provider, plan, Stop, approval, consent, model, runtime serialization, or cloud-provider behavior changes.

## Retained original source

[The source packet](source.json) retains exact original fragments and current caller hashes. [The qualifier](qualify_source.py) checks their source hashes and coordinates against the existing [ACQ-COMPOSER-ATOM-01 packet](../slash-atom-preservation/packet.json).

The original Conductor 0.87.6 renderer is `assets/renderApp-D_fmY7hW.js`, 11,600,457 UTF-8 bytes, SHA256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its retained REA evidence is `ev_b733d96728b664ae9af5923651b87c1bf86770b03ed36b85d35c81d72254a367`.

The scoped original chain is:

1. `jI`, UTF-8 bytes `[8679149,8679618)`, builds separate skill IDs from each name and `nde(path)`, while the displayed label can be identical.
2. The slash selector, `[8680979,8681314)`, passes a skill choice to `BNi` rather than inserting only the label.
3. `BNi`, `[8651020,8651089)`, forwards the selected ID with the skill mention character.
4. `eki` and `nce`, `[7577223,7577469)`, store that ID in a mention and insert it at the selected range.

These are zero-based, end-exclusive UTF-8 byte ranges, not editor positions. The source packet separately identifies the current OpenConductor chain from `skillCommand` through `Composer.pickCommand`, `codexChat.prompt`, `linkCodexSkills`, and Rust `ClientRequest::TurnStart`.

REA inventoried the renderer but skipped semantic parsing after the worker exhausted its heap. These fragments are retained inert compiled source, not an REA-generated call graph or a target execution. No new artifact acquisition or REA invocation was needed. The `nde` implementation and pill rendering are not newly qualified by this scoped packet.

[The supplemental handoff](original-serialization-handoff.json), copied byte-for-byte with SHA256 `6296949e3b053bd0f6f7d56e6c8904a8b481d7723af9d7c9e659bfadf3b72238`, extends the retained chain through `lHt.onUpdate`, `nqn`, and the complete historical `Wxo` serializer. `Wxo` emits `§⟦label⟧(selected-id)`, not Markdown, for a skill atom. Its source was retained from the original 2026-11-06 tool observation. Its reported absolute offset was not independently rebound against the whole renderer this turn. The handoff preserves that limit and its exact source hash; it is supplemental source evidence, not a fresh target observation.

## Frozen failure-first regression

The tests were committed before the product edit at `c684b66`. [The fixture hashes](fixture.sha256) are identical for the failing and passing runs. The tests call the actual `commandSet`, `completeInsert`, and `linkCodexSkills` implementations without replacing those functions.

```bash
node --experimental-strip-types --test --test-concurrency=1 \
  src/features/chat/slashCommands.test.ts \
  src/features/chat/slashCompletions.test.ts
```

- [Baseline](baseline.log) failed as expected, with 13 passes and 3 failures. The decisive mixed-reference failure sent the user-skill path twice instead of the picked project path followed by the typed user-skill path.
- [Candidate](candidate.log) passed all 16 tests, with no skipped tests.
- Both menu orders, either same-name row, identical display labels, metadata reordering, absent metadata, mixed explicit and typed references, typed first-match behavior, and unchanged Claude and Reason insertion are covered.
- The fixtures use paths already supported by the existing Rust link grammar. Whitespace paths, parentheses, escaping, and unsupported name grammar are not newly supported or claimed.

The failure includes:

```text
+ '[$deploy](/u/.codex/skills/deploy/SKILL.md) then [$deploy](/u/.codex/skills/deploy/SKILL.md).'
- '[$deploy](/r/.agents/skills/deploy/SKILL.md) then [$deploy](/u/.codex/skills/deploy/SKILL.md).'
```

## Checks and limits

[Nearby controls](controls.log) passed 29 tests, with no skipped tests:

```bash
node --experimental-strip-types --test --test-concurrency=1 \
  src/features/chat/composerSlashAtoms.test.ts \
  src/features/chat/composerSlashDirectory.test.ts \
  src/features/chat/codexChat.test.ts
```

These controls run the actual Composer against headless editor and Tauri boundaries. They cover bounded slash replacement, suffix file nodes and text, stale ranges, the composition guard, unavailable callbacks, Plan and Fast controls, queue handling, and fake-Tauri Codex submission. They do not prove native focus, real IME, or provider acceptance of the changed picked-skill text.

```bash
python3 evidence/chat/composer/skill-path-identity/qualify_source.py \
  --output evidence/chat/composer/skill-path-identity/source.json
sha256sum -c evidence/chat/composer/skill-path-identity/fixture.sha256
git diff --check
```

Passed. The qualifier reports 17 source and hash assertions. Those assertions are not behavior tests.

Local full typecheck and build were not repeated under shared CPU saturation. Automatic enabled PR CI supplies their exact-head verdict. No browser, server, native app, configured or real provider, E2E, packaging, manual workflow dispatch, screenshot, or installed/deployed verification was run. Release owner 992 retains the separate fixed-cut package lane; this next change is outside that cut.
