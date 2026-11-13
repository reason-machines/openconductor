# Original macOS package asset retention

Conductor Rebuild prepared this change against main `c79a81086c3a0e5ba81f1a9a53ec63a4f4dde7ba`.

The existing manual-only package workflow uploads the app ZIP and bundle check but discards the original frontend and Tauri codegen files. The added collector retains those original bytes in `frontend-codegen-witness.zip`, with a source and bundle manifest. The existing artifact also includes its hash receipt, `asset-witness.json`.

The collector runs after the existing bundle check and ZIP steps:

```bash
python3 tools/collect_macos_asset_witness.py --source-commit "$GITHUB_SHA" > asset-witness.json
```

It uses only the Python standard library. It records the exact checkout commit, selected product and build-input Git blobs, original asset hashes and directories, executable and Info.plist hashes, the bundle-check hash, and app ZIP hash. It verifies ZIP CRCs and equality between the ZIP's executable and plist and the checked bundle. It rejects missing source maps or codegen files, changed selected source bytes, symlinks, oversized assets, and an existing output file. An error removes only the new partial witness ZIP.

The packaging script, signing, build commands, workflow triggers, runner, artifact name, and retention period are unchanged. No workflow was enabled or manually dispatched to verify this change.

## Verification receipts

- `baseline-red.log` preserves the original expected failure of the integration test against the unchanged package workflow. The producer did not retain the witness.
- `fixture-green.log` preserves the original 18 passing collector and integration fixtures against the proposed workflow.
- `checkout-green.log` records the same 18 fixtures passing after application to the assigned checkout. Reproduce with `python3 -m unittest discover -s tools -p test_collect_macos_asset_witness.py -v`.
- `bridge-integration.log` preserves the earlier synthetic collector-to-ZIP-to-Brotli/Mach-O inspection. It retained four original streams and recognized two synthetic mapped assets. This was not a built app.
- `source-guard.json` records exact workflow normalization and the unchanged packaging script. Removing only the retention step and two upload paths restores the baseline workflow byte for byte.
- Python compilation, `bash -n scripts/package-macos.sh`, and `git diff --check` passed.

`SHA256SUMS` records the raw receipt hashes.

## Limits and active build separation

These fixtures prove retention behavior, not actual hosted artifact retention. A downstream validator must decode the original compressed assets and match them to the app executable and source maps. The collector does not prove executable embedding, runtime asset lookup, authenticated build provenance, build hermeticity, or native behavior. The retained bundle-check report is not an independent signature check.

E1's active host-only build remains pinned to the original c79 source archive and bridge collector. This change does not replace those inputs or retarget that build. Actual package inclusion and native acceptance are separate checks and are not established by these receipts.
