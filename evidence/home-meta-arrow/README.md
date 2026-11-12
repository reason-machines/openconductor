# Home Meta+Arrow endpoints

Conductor Rebuild owns the local Home search-key endpoint correction. This record separates retained REA source, mounted-component tests, and native acceptance.

## Source contract

The retained Conductor 0.87.6 renderer is 11,600,457 bytes with SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The original evidence and seven exact fragments remain unchanged in [home-ime](../home-ime/source.json). Its REA evidence IDs are preserved in [source.json](source.json).

Home `UJo` mounts the `KV` command root and `kI` input. `KV` wraps `P6`, whose root is `Xyi`. After rejecting consumed and composing events, `Xyi` handles ArrowDown with `Z` and ArrowUp with `se`. `Z` prioritizes `metaKey` and selects the last item. `se` prioritizes `metaKey` and selects the first item. Both prevent default before looking up a row, including when there are no rows. `X` changes selection without activating the row. Enter remains separate.

Relevant half-open UTF-8 byte ranges in the full renderer:

- Home input and command-root callers: `[9872241,9872363)` and `[9874404,9874524)`.
- `KV` calls `P6`: `[2914170,2914204)`; `P6` binds `Xyi`: `[2912384,2912493)`.
- Existing-item selection `X`: `[2907217,2907292)`.
- Modifier handlers: `[2907684,2907842)`.
- Composition and consumed-event guard: `[2907971,2908067)`.
- ArrowDown and ArrowUp dispatch: `[2908112,2908141)` and `[2908186,2908214)`.

Fresh main `fc5215e8b6e7fd5e12767155fdbb9d0bcc1e82f1` has no Meta predicate in `AllWorkspaces.onSearchKey`. With A/B/C rows, Meta+ArrowDown from A selects B rather than C. Meta+ArrowUp from C selects B rather than A. This is a static deduction, not observed native behavior.

## Regression boundary

The new nine-case fixture mounts the actual Home component inside the actual KeybindingsProvider. It reads selected rendered options, cancellation, and dispatched selection actions. Its six gap cases cover both endpoints, Meta precedence, filtered results, an empty list, and no search matches. Three controls cover composition and consumed events, ordinary and non-Meta arrows, and a single row.

The regression-only published head `26970d79d8bdf1727f294fb2d6e14ab23d5a9b87` changed no product handler. Automatic CI observed six intended assertion failures and three passing controls in both frontend jobs. All six failures are `ERR_ASSERTION`: four select the adjacent row rather than the endpoint, and two fail to cancel native endpoint movement on an empty result. See [baseline.json](baseline.json), [original unit output](baseline-unit.log.gz), and [original build output](baseline-build.log.gz).

The focused correction adds Meta+ArrowUp and Meta+ArrowDown to the existing endpoint branch. It preserves the composition guard, adjacent arrows, row production, and separate Enter activation. The identical six inputs were checked again against fresh main `bce99cb5023d22bdc2fa6eac203b74cb915b6208` before the patch. Existing IME, endpoint, number-hint, two seven-case Archive fixtures, and the paired Header case file are frozen alongside the new fixture.

Only the local Meta endpoint predicate is in scope. Global dispatch, shortcut resolution, row production, filters, Alt group navigation, and activation are excluded. The canonical ledger confirmed sole ownership and lifted the earlier sequencing pause after #1133 merged.

## Checks

Passed on Reason Cloud:

```bash
python3 evidence/home-meta-arrow/verify_source.py --phase baseline --renderer .ara-state/retained-conductor-renderer.js
sha256sum -c evidence/home-meta-arrow/fixture.sha256
git diff --check
```

The verifier checked the full retained renderer, all seven exact REA fragments, six fresh-main inputs, and seven frozen fixture files. The candidate check also passed with `--phase candidate`; it accepts only the two endpoint-line edits relative to the original baseline. These are source and integrity checks only.

Automatic frontend jobs run the new fixture with `node --test "src/**/*.test.ts"`. Baseline [unit job](https://github.com/reason-machines/openconductor/actions/runs/43166437567/job/131009296562) and [typecheck/build job](https://github.com/reason-machines/openconductor/actions/runs/43166437567/job/131009296208) both reproduced the intended six failures and three controls. Typecheck itself passed. Candidate behavioral verification remains pending. No local Node, Rust, browser, native app, manual workflow dispatch, or rerun was started. No screenshot is available because no visible runtime was admitted. Installed-package acceptance remains with the sole native executor and is unverified.
