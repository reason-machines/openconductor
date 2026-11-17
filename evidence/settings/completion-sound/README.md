# Completion sound catalog successor

Owner: Conductor Rebuild / SAME49. This extends the existing Settings source interest. It is not a new ACC intake, runner, install or runtime grant.

## Change

The candidate restores the 14 historical Completion sound IDs and their menu groups. The frontend derives `SoundType` from that catalog. Rust serializes the matching IDs and accepts the old `none` spelling as an alias for canonical `disabled`. The existing `default` remains the default.

All audible choices continue to play OpenConductor's synthesized chime. The row explicitly says original recordings are not included. No original MP3s or logos are copied. Audio identity, timing, loudness and native/visual parity remain unverified. This is not an audio-fidelity fix.

Historical reference playback preserves the selected ID, falls back to the default recording for unknown IDs, and treats only `disabled` as silent. Compatibility with this app's old `none` is our migration, not a claimed reference feature. The Rust candidate supports all 14 known IDs; arbitrary unknown stored IDs remain outside that enum. Playback accepts an unknown ID and uses the documented synthesized default fallback.

## Source and composition

`source.json` records fresh-main blobs, 21 hashed retained spans, candidate hashes and 156 protected inputs. The reference is Conductor 0.87.6 from historical real-app REA extraction. No reference JavaScript, original audio or native process ran during preparation. The original renderer semantic-analysis heap failure remains a tooling gap.

`candidate.patch` applies only the Completion sound edits to the five baseline files. It does not contain SendKey or Follow-up edits. `source.json` pins the sound-row successor of the frozen SendKey candidate. `integrated/GeneralPage.tsx.txt` composes it with SendKey and Follow-up. Rust and type changes are retained as small replacement spans in the generator and full diffs, not duplicated whole files. Both application orders produce identical bytes; their changed intervals do not overlap. Existing product files and frozen packets are untouched.

Before any application, sole ACC must qualify the actual current main and exact local successor under the existing Settings position. A source checkpoint does not grant runtime capacity or authorize a separate installer. Preserve original `e972f2f8`/`2227b5db` bindings rather than editing their hashes.

Static qualification, with no JavaScript execution:

```bash
python3 evidence/settings/completion-sound/verify.py --fresh-main
git diff --check
```

## Matched serialized validation

All commands below are **NOT RUN**. They require sole ACC's matched bound and dependency/capacity disposition for this checkout. Dependencies are Node, the lockfile's TypeScript, React and react-test-renderer; typecheck needs the full locked frontend dependency tree. Rust checks need the existing Cargo lockfile dependencies and host build prerequisites. No install is bundled into these commands.

Reference fixture, seven cases. The fixture evaluates only retained functions with synthetic query/storage/audio boundaries. It performs no real fetch, playback or native invocation:

```bash
node --test evidence/settings/completion-sound/reference.test.cjs
```

RED against current-main baseline, then GREEN against the candidate and composed successor. Each invocation has ten cases. Baseline is expected to fail on the missing catalog/groups, canonical silence and disclosure; no claim is made that every baseline case fails:

```bash
COMPLETION_SOUND_SOURCE=baseline node --test evidence/settings/completion-sound/product.test.cjs
COMPLETION_SOUND_SOURCE=candidate node --test evidence/settings/completion-sound/product.test.cjs
COMPLETION_SOUND_SOURCE=integrated node --test evidence/settings/completion-sound/product.test.cjs
```

After an approved application, run the same ten cases on the actual product files and the existing neighboring SendKey/Follow-up regression contracts. Do not silently amend their queue bounds or frozen inputs:

```bash
COMPLETION_SOUND_SOURCE=product node --test evidence/settings/completion-sound/product.test.cjs
node node_modules/typescript/bin/tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml --lib settings::tests::completion_sound_ -- --test-threads=1
```

The Rust command selects three tests, including all 14 load/save/reload cases, legacy alias canonicalization and a missing-value default. Capture exact exit statuses. A compile failure, missing prerequisite or timeout is not a test pass. A future ready PR against main requires actual admitted validation; every exact-head workflow must pass before merge. A UI screenshot must come from the sole authorized visible-test owner, not a second native dispatch. None is available at this source-only checkpoint.
