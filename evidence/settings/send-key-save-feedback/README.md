# Send-key save failures reach the existing error notifier

Source-only candidate owned by Conductor Rebuild / SAME49. No reference, baseline, candidate, TypeScript, browser, or native check has run. Installs and tests require sole ACC serialized admission. Add/Cancel checkpoint `7c901b239`, request `3898220e`, and frozen Auto-run checkpoint `c6a1a725d` are unchanged.

## Source and scope

Checked main `6ab46a36752de4f57cb3c3441f4336d334ad1340` ignores a false result from `chooseSendKey` and logs rejected saves only to the console. `SettingsView` already provides an error notifier to `GeneralPage`, but that page does not forward it to `SendKeyRow`.

Retained Conductor **0.87.6** USER registration `general/message_send_key` calls `xAn`. The renderer imports `qF as xAn`; the index exports `RQt as qF`. `RQt` forwards override writes through `BUt`, then writes the legacy send-key preference. The registry's change callback calls `kt.error("Failed to update message send key")` when this operation resolves false or rejects. `Z5e` forwards that callback to its Select control. Exact original asset hashes, seven UTF-8 byte ranges, and REA receipt are retained in `source.json`.

The original REA renderer semantic analysis exhausted its heap. These are read-only spans from retained shipped assets, not a new semantic-analysis success. Current installed version, renderer equality, native behavior, and visual parity remain unverified.

The ledger cleared this exact consumer in message `c9f001bc-d0f6-481c-9237-0797d7928cc7`. The production diff only forwards `notify` through `GeneralPage` and reports false/rejected saves in `SendKeyRow`. Reset UI, shared Select, keybindings, persistence services, notification implementation, and chat submission are excluded.

## Regression contract

Eight product cases mount the actual page and drive its native select handler. They cover refused and rejected override writes, rejected legacy writes, successful persistence, retry after failure, both failures with no optional notifier, and the Custom placeholder. They execute the existing `chooseSendKey` helper. Native persistence and the keybinding-provider store are explicit fixture boundaries. Other settings controls are inert.

Four reference cases execute the retained registry change callback and `RQt`/`BUt` functions against synthetic persistence and notification boundaries. Preset contents, current-mode hook, row elements, and shared Select are not executed as the real application.

The same eight product cases run against the frozen main page before the fix and the candidate after it. The expected baseline is four failed feedback assertions and four passing controls. This is an expectation, not a measured result.

Commands below are pending direct admission, not results:

```bash
node --test evidence/settings/send-key-save-feedback/reference.test.cjs
SEND_KEY_ROW_BASELINE=1 node --experimental-strip-types --test src/settings/sendKeySaveFeedback.test.ts
node --experimental-strip-types --test src/settings/sendKeySaveFeedback.test.ts
node --experimental-strip-types --test src/settings/composerSettings.test.ts src/settings/notificationDenialFeedback.test.ts src/settings/fullDiskAccess.test.ts
npm run typecheck
```

No screenshot exists because browser/native execution has not been admitted. A component fixture is not installed-app acceptance.

Static integrity only, with no application or retained JavaScript execution:

```bash
python3 evidence/settings/send-key-save-feedback/qualify.py
```
