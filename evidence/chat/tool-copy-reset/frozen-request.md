# TOOL-ROW-COPY-FEEDBACK-BE7 — duration-only frozen RED request

Author: Conductor Rebuild.

## Source qualification

Checked main: `5397204995280d90903e17dae3f391759bcde1d9`.

The retained real Conductor renderer's entire 11,600,457-byte parent passes SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. `source.json` contains 14 complete original-byte ranges and digests. `qualification.json` holds all range digests and current source/dependency pins. This is retained shipped-byte attribution associated with REA receipt `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`, not new native observation or new semantic REA. The historical semantic pass skipped the renderer after heap exhaustion.

Normal complete caller/producer bindings:

- ExitPlanMode -> registry -> hIt -> gpo(input.plan) -> t0(text).
- Task/Agent/sub-agent -> registry -> hIt -> typed bpo(toolResult.content) -> yZe(content) -> t0(text).
- t0 stops propagation and waits for the clipboard copy to fulfill before showing its check; every success retains an independent 2000ms reset. l1 calls navigator.clipboard.writeText.
- Current main's actual plan and typed-subagent callers share CopyIcon, which instead schedules 1500ms resets.

Ledger cleared NO_RECORDED_COLLISION (partial history, not exhaustive), SAMEBE7 only. This unit is distinct from #1473 CopyCode and #1475 Transcript copy. Scope is ONLY the successful-reset duration. No label/tooltip/error policy, payload, plan approval, result-selection or provider change is included or claimed fixed.

## Frozen actual-component fixture — UNRUN

`toolCopyReset.test.ts`: 8,538 bytes; SHA-256 `baca8d635d26f2c93f7cc97356fc232ae0cb780b86847b17449b5259e355105a`.

The fixture compiles the complete current production ToolRows module and mounts its actual ConductorToolRow -> Row -> MoreRows -> CopyIcon / SubagentRow -> CopyIcon with real React state, disclosure, registry/toolKind, resultText, and native deferred clipboard Promises. Only unrelated Markdown/link/backend presentation is stubbed. No copy-state implementation is copied into the fixture. The deterministic clock executes production-scheduled callbacks; it does not normalize their deadlines.

Eight tests: four expected timing failures (two per actual caller), four passing controls. The intended RED has ONLY `TOOL_COPY_RESET_MUST_NOT_FIRE_AT_1500` and `TOOL_COPY_FIRST_RESET_MUST_WAIT_UNTIL_2000` semantic assertion failures; no setup failures, unhandled rejections, cancellations or skips. Controls retain exact plan text, original structured-result conversion over an intentionally different flattened fallback, stopped propagation, disclosure state, delayed fulfillment, and absent-payload gating.

Existing typedSubagentRawResult/typedSubagentErrorResult assertions are preserved verbatim in baseline/. After intended RED, the proposed one-line product fix is 1500->2000. The two older exact timer expectations will need source-justified 2000 deadlines rather than1500, retaining the assertions and all other controls (not deleting, weakening or normalizing them). Their runtime is a separate request, not included in this standalone RED reservation.

## Requests — neither install nor test is admitted by this document

The fixture is source-only and unrun. No product source has been edited. Missing dependencies must be provisioned under a separate dependency-only admission BEFORE standalone RED. `prepare_runtime.py` only copies frozen files into a small runtime directory; it does not install or execute tests.

### Dependency-only request

One assigned CPU (CPU0 only after fresh affinity gate); one npm/Node foreground install; timeout300s + TERM grace5s + cleanup30s; nice10, UV threadpool1, old-space768MiB, estimated RSS<=1.5GiB, incremental disk<=2GiB, fresh free disk>=4GiB. Lock SHA-256 `2203faf80f07760a020cb1c4aa3ef55e2c25db72a887c5c02808b0d2c2621992`. Existing lock only; ignore-scripts, omitoptional, maxsockets1, no audit/fund. Package identities from lock: react18.3.1, react-test-renderer18.3.1, typescript5.9.3. No build/test/browser/native/provider/publication.

From `.ara-state/tmp/tool-copy-reset/runtime`, after gated preparation:

```bash
mkdir -p .runtime-tmp
TMPDIR="$PWD/.runtime-tmp" taskset -c 0 nice -n 10 timeout --signal=TERM --kill-after=5s 300s env NODE_OPTIONS=--max-old-space-size=768 UV_THREADPOOL_SIZE=1 npm_config_jobs=1 npm ci --ignore-scripts --omit=optional --no-audit --no-fund --maxsockets=1 --cache="$PWD/.runtime-tmp/npm-cache"
```

Verify lock/fixture unchanged and installed identities. Remove generated cache/temp. Retain dependencies across separately admitted RED/GREEN only if ledger explicitly allows it; otherwise remove them and report actual cleanup/release. Report actual exit/termination/release (deadline is not release). RSS bounds are estimates, not measurements.

### Standalone RED request

One assigned CPU/Node process;60s + TERM grace5s + cleanup30s; old-space768MiB; estimated RSS<=1.5GiB; existing dependencies only; incremental output<=16MiB; fresh disk>=4GiB and fresh affinity/fixture/source/lock/dependency identity/Node TypeScript capability gates. No product edit, install, build, browser, native, provider or publication. A semantic profile mismatch stops work; do not weaken or replace the fixture. GREEN is a separate request after actual release and intended RED.

Exact frozen command, from the prepared runtime directory:

```bash
taskset -c 0 timeout --signal=TERM --kill-after=5s 60s env NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 src/features/chat/toolCopyReset.test.ts
```

## Limits

Not run: this fixture, legacy tests, typecheck/build, browser, OS clipboard, native/Tauri, providers, package or installed-app parity. No screenshot exists because no visual/runtime admission was granted. Package/native acceptance for prior merges stays with Root and sole E1 owner. No duplicate dispatch.
