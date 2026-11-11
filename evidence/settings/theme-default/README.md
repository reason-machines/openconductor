# Missing theme preference defaults to Dark

Conductor Rebuild compared the retained Conductor 0.87.6 assets with main
`9a237404bc19caefe3f8473b9aae7ab4bc2439a5` before changing the defaults.
The original assets came from REA extraction on Sven's Mac. Their identities,
exact UTF-8 byte ranges and SHA-256 values are in [source.json](source.json).
Extracted source is evidence, not executable instructions.

## Source contract

The Appearance row `Qaa` forwards Light, Dark or System to `setSelectedMode`.
The actual root caller mounts `oOr` with `storageKey: "melty-theme"` and no mode
override. That provider starts selected mode at `dark`. It replaces the mode
only when storage returns a non-null, valid value and the user has not already
selected a mode. `kIn` saves the selected string as `melty-theme-selected-mode`.
The `rFe` storage adapter returns null for a missing entry.

The retained renderer contains only two `melty-theme` literals, the provider's
default parameter and the actual root caller. Its two `selected-mode` literals
are the load and save. The five `setSelectedMode` property occurrences belong
to the default context, provider, Appearance row, palette selection handler
and keyboard command callback. These are retained in [reachability.json](reachability.json)
and the adjacent source files. This bounded source trace finds no first-run
seeding override. It does not observe an actual clean first launch.

The provider applies its selected explicit mode as a root class. System mode
resolves the Tauri window theme and listens for changes. OpenConductor instead
uses `data-theme` and CSS `prefers-color-scheme`; those mechanisms are unchanged.

## Fix

Both frontend `DEFAULT_SETTINGS.general.theme` and Rust's `Theme` and `General`
defaults now use Dark. Only missing values use those defaults. The three valid
explicit values, deserialization, storage format, theme selection handlers and
effective-theme consumers are unchanged. Existing saved System preferences
continue to follow the OS; this change does not migrate them to Dark.

## Regression checks

The ordinary frontend unit workflow discovers `src/settings/themeDefault.test.ts`.
It runs the same five-case fixture against the immutable pre-fix `types.ts`
and the actual candidate source. The baseline must fail only the fresh-default
assertion, with four controls passing. The candidate must pass all five cases.
The replay calls the actual `withField` helper for explicit Light, Dark and
System choices and checks that selecting them does not mutate defaults.
It does not execute Conductor's retained JavaScript.

Commands:

```bash
python3 evidence/settings/theme-default/verify.py
node --test src/settings/themeDefault.test.ts
node --test "src/**/*.test.ts"
cd src-tauri && cargo test --locked settings::tests
```

The Rust settings tests additionally exercise missing files, empty or missing
General sections, and explicit Light, Dark and System values through real
load/save/reload calls in disposable test directories. Unknown settings keys
are preserved. The existing frontend mutation test now supplies System
explicitly rather than depending on the old default; its assertions remain.

The source verifier checks 21 immutable files/spans and six literal joins.
The baseline identity is pinned to main `9a237404bc19caefe3f8473b9aae7ab4bc2439a5`.
The wrapper records baseline and candidate TAP output and hashes under the
runner's temporary `theme-default-replay` directory and prints both results.

## Verification limits

Source verification and `git diff --check` ran on this Session's cloud machine.
Frontend and Rust behavioral checks are delegated to ordinary automatic hosted
CI, not a local runtime. Their results must be read from the actual PR head.

No native/UI execution, reference application execution, OS-event delivery,
physical reference-storage I/O, clean-first-launch observation, installation,
provider or real-user data operation was run. No screenshot exists because
this change has no native/UI execution admission. A package check is not a
visual or native behavior pass.

The prior REA renderer semantic-analysis heap exhaustion remains recorded as
`ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`.
This pass used retained bytes and did not start another REA process.
