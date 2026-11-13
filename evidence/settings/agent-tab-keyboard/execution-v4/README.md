# K1 Agents-tab keyboard correction

Conductor Rebuild applied the sealed `AgentTabRow` correction after qualified behavioral RED and GREEN. ArrowLeft and ArrowRight wrap, Home and End select endpoints, focus activates a tab, and only the selected tab participates in Tab order. Modified keys, vertical arrows, Tab, Escape, and endpoint controls retain their existing behavior.

## Actual verification

Validation ran on Reason Cloud computer 355 against freshly fetched main `4fe392155011727e0728ebc2c668db37ee98c48c`, assigned branch `reason/task-64baa6b6`, baseline head `308751bb69df97ad73e9e3f639eef83cb7ad1e18`, and tree `1ee77e0a74d2930888735403a1c577b089e1d478`.

- PASSED exact reuse binding. All 21 source pins, project lock and installed React, ReactDOM, and TypeScript versions, all 44 retained isolated package metadata files, resolved dependency inventory, loader, argv, environment, candidate, and protected Original11 bytes matched the saved baseline. No baseline rerun or installation occurred.
- Qualified RED was reused from [losslessly compressed original TAP](red.tap.gz), decompressed SHA256 `a02cecb372b1222ab08311aba176ab0dbd8a50307deed1f5a8399e52f318b04e`. Exit 1. Exactly cases 1 through 10 and 22 failed with `ERR_ASSERTION`. Eleven controls passed. All 22 cases ran with zero skips, TODOs, or cancellations.
- PASSED candidate application and source check. The exact sealed patch `722b674f6f6ea92dd9ae95b9f352589195c8192ae2da384c1b0f1db36a46fd7a` changes only `AgentTabRow`. `python3 -B evidence/settings/agent-tab-keyboard/activation-v3/verify_source.py --main 4fe392155011727e0728ebc2c668db37ee98c48c --phase candidate` exited 0 before publication activation.
- PASSED identical-input GREEN. [Raw TAP](green.tap), SHA256 `3e473c142fadd15a946a8352a372908abf8d4f2eb48eca9ea7eb4a86904d847b`, records exit 0 and 22 passes. No skips, TODOs, or cancellations. The single GREEN phase took 3.875543 seconds.
- PASSED guarded cleanup. Scratch was restored to original `833644d9`. The canonical fixture, assertions, Original11, project manifests, and protected files remained unchanged. The retained isolated prefix was not reinstalled or borrowed.

Both RED and GREEN used this exact command from the checkout root:

```bash
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=768 \
AGENT_TABS_SOURCE_ROOT="$PWD" \
ONBOARDING_DOM_DEPS="$PWD/.rea-work/open-in-escape64/proposal-v2/dom-deps" \
timeout --signal=TERM --kill-after=5s 115s nice -n 19 \
node --test --test-concurrency=1 --test-reporter=tap \
"$PWD/.rea-work/settings-tab-census64/agentTabsKeyboard.dom.test.mjs"
```

The remaining serialized continuation started at `2026-11-13T00:33:39.789418Z` and released at `2026-11-13T00:33:43.979051Z`, after 4.189633 seconds within the remaining 355-second cap. Non-test work used 0.278165 seconds of its remaining 59 seconds. Cleanup used 0.023723 seconds. Own jobs, servers, and support processes were empty at release. See the immutable [receipt](receipt.json) and [exact baseline binding](baseline-binding.json).

## Explicit loader amendment

The original canonical frozen22 file remains SHA256 `833644d93d3c45c4846800c2d923540ff53c57b22d2aa1f53aaf99dbc1789d51`. It lacks browser URL globals at the VM boundary. Its earlier 22-failure preassertion baseline is invalid and supplies no product RED credit.

The executed loader adds only the real jsdom `window.URL` and `window.URLSearchParams` properties to that sandbox. Its executable input hash is `ececae31184996182e88a8608bffec216ee055fe83a8c03e38d789a09f18e8fa`. All assertion and case bytes remain unchanged, with suffix hash `11675e5817b5cf1c705ab402474423abf385dd95f5161d9588ecf6e70e84e918`. This is an amended-loader pass, not an original-full-file pass.

The amended-loader RED initially produced an unchanged STOP receipt because the old inspector mistook numeric `# skipped 0` and `# todo 0` summaries for directives. [That receipt](original-stop-receipt.json) remains unmodified. The corrected inspector checks actual result-line SKIP and TODO directives separately from numeric summaries and retains exact failure, control, error-code, case, and zero-count checks. [Derivative RED qualification](red-qualification.json) records the corrected classification without rerunning Node.

## Publication

Only after valid GREEN did the distinct combined activation patch `165c1e431f4774b605b72524f170cfe87d0119cbbd6fdc6ae1726ede91f97e58` apply. The active wrapper is SHA256 `34741ebf0b37b90b505e12aa2beb85020072c30741c6d3e8ad38ea2ccb657432`. It hashes the canonical fixture, projects the explicit URL pair into its own temporary file, verifies the complete amended input hash, runs one child, requires exact ordered cases and zero failure, skip, TODO, and cancellation counts, and removes its own temporary directory.

The workflow provisions isolated `jsdom@26.1.0` before automatic test discovery. It moves the existing manual-job provisioning before discovery rather than adding a duplicate install. No trigger, job, runner, permission, root dependency, or project lockfile changes. Transitives are not lock-frozen. Their resolved inventory was checked against the retained successful install for this local run.

The original `08cbdc5b` activation and archived wrapper remain historical and unchanged. They are not the activated input. The full terminal archive is attached in the [owning Session](https://reasonmachines.com/agents/64baa6b6-4caf-47f1-aa8d-e14a966cc243), SHA256 `74b2b15cff942368d1296347c6dba6c63e18eb4670d465f2368b15657c6aa55b`.

## Limits

Hosted wrapper CI is pending publication of this change. Local wrapper execution, typecheck, build, adjacent suites, browser, native Conductor, provider sign-in, and package verification were excluded and not run. No screenshot is supplied because browser and native execution were explicitly outside the admitted unit. Mounted jsdom focus assertions do not prove visible macOS focus, native parity, package inclusion, or live sign-in.

The retained [REA literals](../reference/) provide the static reference basis, not new native observations. K1 remains distinct from Original11. Release and native verification stay with the existing serialized release owner. This change creates no runtime intake or runner.
