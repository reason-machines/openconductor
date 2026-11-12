# Copy stored provider-key values

Conductor Rebuild owns the shared `SecretRow` value-activation and lazy-copy handler, the new mounted regression, and this evidence. The ledger cleared that exact scope. The existing key-link fixture, Claude caller, status payload, native allowlist, and provider implementation remain unchanged.

## Source contract

The original shipped renderer joins `$pa` to `jpa`, `Dzi`, and index `ng`/`kB`. Its `oO` and `xz` return full stored values. `jpa` passes `ANTHROPIC_API_KEY` through `YWt` to `Zla`. `Zla` displays the mask from `Jla` until Reveal, but its value button always passes the complete value to renderer-local `l1`. That helper selects browser `navigator.clipboard.writeText` or native `xni`, imported as index `bS`/`Q0e`, which invokes the clipboard-manager command. Success and failure feedback name the field, not its value.

At fresh checked main `5d182b1e374d1b8b2676b17da59c45b6e74834f8` on 2026-11-12, the real `ClaudeTab` caller chooses the canonical current-provider key. `useAgentStatus` and `storedSecret` provide presence and a last-four hint only. The lazy reveal callback retains the native current-provider allowlist. `SecretRow` renders the stored value as a span with no copy action, both masked and revealed. This is a missing explicit interaction, not permission to copy a hint or preload full values.

[`source.json`](source.json) records the complete 17-span join, original archive and asset hashes, six fresh-main source identities, and the retained REA evidence ID. [`verify_source.py`](verify_source.py) checks those bytes against the original source archive without executing its JavaScript. The historical REA semantic renderer analysis exhausted its heap; retained shipped-byte slices are the source evidence. No new REA failure occurred during this pass.

## Regression boundary

`tests/chat-search/secretValueCopy.dom.test.mjs` mounts the production `ClaudeTab`, status loader, `SecretRow`, and toast rendering. Status, reveal, and clipboard are inert boundaries. Unrelated config-file UI and animation are excluded. The only complete value accepted by the simulated clipboard is `fixture-only-not-a-key-1234`.

The cases cover lazy masked copy, revealed copy without another retrieval, no retrieval on mount, an unconfigured key, failed or empty retrieval, unavailable or rejected clipboard, and unchanged Show/Hide behavior. A pending copy cannot start another retrieval. Copying does not reveal the masked value, refresh status, configure providers, save settings, or delete credentials. Both success and failure feedback contain only the field label.

The original key-link fixture and this new fixture are pinned in [`fixture.sha256`](fixture.sha256). Neither may change between the recorded baseline and candidate runs.

## Checks

Conductor Rebuild ran these checks sequentially on Reason Cloud computer `212eb2a5-e87b-4b2d-9797-78cfa6a9902c` on 2026-11-12. The ordinary check slot was released at 09:30:33Z.

- **Passed source integrity.** `python3 evidence/settings/secret-value-copy/verify_source.py <original-source-archive>` verified the original archive, both complete assets, 17 exact spans, six source identities, and frozen fixtures. The six source files were identical at historical qualification main and the fresh main above.
- **Failed before the fix as intended.** `ONBOARDING_DOM_DEPS="$PWD/.ara-state/secret-copy-dom-deps" timeout 120s node --test --test-concurrency=1 tests/chat-search/secretValueCopy.dom.test.mjs` at local baseline `a5add3c72adc3a5b15e355d9699bd7ec0a29a28e` produced six copy-related failures and three passing controls. Masked activation made zero reveal requests instead of one. Revealed activation wrote nothing instead of the complete fake value. The failure-path cases also stopped at the absent activation. See [actual baseline](red.tap).
- **Passed after the fix.** The identical command and SHA-256-frozen fixture passed all nine cases, with no failures, skips, or cancellations. See [actual candidate](green.tap).
- **Passed existing key-link tests.** `NODE_PATH="$PWD/.ara-state/secret-copy-dom-deps/node_modules" timeout 120s node --experimental-strip-types --test --test-concurrency=1 src/settings/agents/secretEditorKeyLink.test.ts` passed all four unchanged cases. See [key-link transcript](adjacent-key-link.tap).
- **Passed signed-out Refresh tests.** `ONBOARDING_DOM_DEPS="$PWD/.ara-state/secret-copy-dom-deps" NODE_PATH="$PWD/.ara-state/secret-copy-dom-deps/node_modules" timeout 120s node --test --test-concurrency=1 tests/chat-search/claudeSignedOutRefresh.dom.test.mjs tests/chat-search/codexSignedOutRefresh.dom.test.mjs` passed all ten cases. See [Refresh transcript](adjacent-refresh.tap).
- **Passed frozen integrity and patch hygiene.** `sha256sum -c evidence/settings/secret-value-copy/fixture.sha256` and `git diff --check`. No existing test, caller, status, native, or provider file changed.

The only product change is in `SecretRow`. Its value is an accessible button. Masked activation lazily requests the full value through the existing allowlisted callback, writes it without storing it in reveal state, and keeps the row masked. Revealed activation reuses the revealed value. Both paths use label-only feedback and disable overlapping row actions while pending. Clipboard absence, rejection, and empty retrieval report failure without exposing a value.

Node was v22.23.4. One bounded dependency preparation generated an isolated exact-pin lock and ran `npm ci --ignore-scripts --no-audit --no-fund`. The locked restore installed 49 inert packages in three seconds. It did not install application dependencies or change the repository lockfile. [Restore transcript](dependency-restore.log), [exact manifest](dependency-package.json), [lock](dependency-lock.json), and [machine/check receipt](checks.json) preserve the inputs. No check timed out.

Local full-project typecheck, build, and hosted manual-only workflows were not run in this focused slot. Automatic exact-head checks must pass before merge. A skipped or manual-only workflow is not a passing behavioral check.

The ordinary checks run sequentially in the shared computer's assigned test slot. No browser, app, native clipboard, real credential, provider, login, E2E, package dispatch, or heavy build is authorized by that slot.

## Acceptance limits

These are static reference declarations and simulated mounted-DOM checks, not observed Conductor execution or installed-app acceptance. No screenshot exists because no browser or application is launched. Native macOS clipboard behavior, real provider login, installed-app focus, and packaging remain unverified. This change is outside the existing consolidated release cut.
