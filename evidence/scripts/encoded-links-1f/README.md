# Encoded script-output links

Conductor Rebuild adds the retained Conductor encoded-link policy to the existing `ScriptOutput` terminal. Command-click on a valid HTTP or HTTPS target awaits a native warning, then opens the original URL only after confirmation. Cancellation, unsupported schemes, invalid URLs, and ordinary or Control-only clicks do not open a target. Warning and opener rejections are handled.

The product change is two imports and the `Terminal.linkHandler` option. It does not change the parser, `backend.openUrl`, caller selection, retained Spotlight logs, input ordering, resize, copying, transcript updates, appearance, or disposal.

## Source evidence

The historical real-app REA acquisition is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The retained constructor [`lno`](reference/lno.txt) requires `metaKey` and sets `allowNonHttpProtocols: false`. Its [`ano`](reference/ano.txt) handler awaits the warning before the opener. Run and Setup reach this constructor through `w9e`; running Spotlight reaches it through `d1e` and `eSa`.

[`source.json`](source.json) preserves both complete-asset hashes, all 28 retained byte spans, their hashes, and the preparation-era source qualifications. Its historical `NOT_RUN` fields describe preparation, not the later execution below. The spans were rehashed before this run. This is retained source evidence, not a new observation of the installed app.

Actual baseline HEAD was `75c2f7bc7cc65d1039a16a8e1fb868296f10b501`, containing then-current main `4b6bc34e93c4fa9ab3eaa042e855b77bd712a926`. The component and all eight neighbor files matched main. [`baseline-binding.json`](baseline-binding.json) records the exact source, dependency manifests, lock, Node version, and resource snapshot.

## Regression and correction

The frozen ten-case fixture SHA-256 is `2c5b3e9f3074d743531169870ea0131e210e90a6478590ee5d294787126127f0`. Its complete behavioral tail is unchanged from the retained original. [`fixture-v1.ts.txt`](fixture-v1.ts.txt) and [`fixture-repair.patch`](fixture-repair.patch) preserve the earlier fixture and its syntax/Unicode mock repair. That repair is not a product fix or behavioral proof.

The baseline test was committed as `28cddffe` before the product edit. The correction matches the presealed [`candidate.patch`](candidate.patch), with component SHA-256 `1488c5c247527b2608310a201f478801a50f9d0f500edef2b71b55ce378c1a70`.

Six existing test loaders receive explicit fail-fast import boundaries for the new dialog/backend imports. Their assertions are unchanged. [`loader-boundaries.patch`](loader-boundaries.patch) preserves the exact support changes. The regression loads the production component, output updater, backend opener, and installed dialog adapter, with controlled xterm, DOM observers, and native IPC.

## Checks

All three commands ran once, sequentially on Cloud computer 352 under the existing ACC grant. Each used nice level 19, a 768 MiB Node heap, concurrency one, and a 120-second timeout. No install or retry was needed.

Identical RED and GREEN command:

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --test --test-concurrency=1 src/scripts/outputLinks.test.ts
```

- **RED reproduced the defect.** Exit 1 at 15:42:05–15:42:06 UTC on 2026-11-12. Exactly seven missing-handler assertions failed; all three transcript/disposal controls passed. No setup failure occurred. [Raw TAP](red.tap) and [command receipt](red.json).
- **GREEN passed.** Exit 0 at 15:43:14–15:43:16 UTC. All ten cases passed with identical frozen bytes, with no skips or cancellations. [Raw TAP](green.tap) and [command receipt](green.json).

Exact eight-file adjacent command:

```bash
nice -n 19 timeout --kill-after=5s 120s node --max-old-space-size=768 --test --test-concurrency=1 src/scripts/output.test.ts src/scripts/outputCopy.test.ts src/scripts/inputOrdering.test.ts src/scripts/outputCursor.test.ts src/scripts/outputUnicode.test.ts src/scripts/runOutputSelection.test.ts src/scripts/runningInput.test.ts src/scripts/runningResize.test.ts
```

- **Adjacent checks passed.** Exit 0 at 15:43:16–15:43:25 UTC. Actual 57/57 cases passed, with no skips or cancellations. [Raw TAP](adjacent.tap) and [command receipt](adjacent.json).
- **Static checks passed.** Frozen source, candidate, support-loader, REA-span, dependency-manifest, and lock hashes matched their retained identities. `git diff --check` passed.
- **Local typecheck, color lint, and full-suite build were not run.** Hosted automatic exact-head CI owns those checks. Every enabled check and triggered workflow must succeed before merge; manual-only skipped jobs are not claimed as passing execution.

[`terminal-release.json`](terminal-release.json) records explicit release at 15:43:51 UTC with no own runtime jobs and no preview or browser started. The release was sent to ACC in message `12c784fe-207b-47d5-b6cc-c57b533b5a4e` before publication. Exposed cgroup limit files were unavailable. The root pressure file matched the host snapshot, so it is not evidence of isolated own-cgroup pressure clearance.

## Verification gaps and release scope

Actual xterm OSC8 parsing, native warning presentation, external browser opening, rendered parity, and native attachment behavior remain unverified. No screenshot exists because browser, server, and native execution were outside this grant. No provider or package operation ran. The fixed #992 package cut and existing release owner are unchanged. This source change requires a later authorized containing artifact and native acceptance before it can be called shipped and observed working.

Stopped-Spotlight thirteen remains a separate frozen, unrun unit. No other terminal unit was executed here.
