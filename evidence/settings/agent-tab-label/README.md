# Agents selected-tab label association

Conductor Rebuild gives each mounted Agents page a React `useId` prefix. Each tab receives a stable, distinct DOM ID. The active panel references its selected tab through `aria-labelledby`. Its existing `aria-label`, URL store, roving focus, keyboard handlers and provider leaves stay unchanged.

This corrects the selected-tab association. The panel was already named. It adds no `aria-controls` promise, inactive-panel contract, authentication-card navigation or provider behavior.

## Retained reference provenance

[reference.json](reference.json) records the retained Conductor 0.87.6 renderer spans and their byte hashes. Historical REA evidence is `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2`. The renderer SHA-256 is `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. The original uploaded archive SHA-256 is `f3ef2620ab60b431a02b3b92c78b7d349fb311af77d532d6012c8d9ed3986084`.

The retained tab registry joins a rendered panel's `aria-labelledby` to its selected tab ID. Reciprocal `aria-controls` resolution was not qualified because later panel props override a rendered panel ID. No claim about that direction is made here.

This is retained-byte static REA, not a new installed-app capture. Historical semantic renderer analysis exhausted heap. No reference JavaScript was evaluated.

## Actual admitted validation

The existing ACC allocation `ACC_64_TAB8_CURRENT_MAIN_20261113T0226` ran once on Reason Cloud 355. It reused the original eight-case packet `1e51cafc003c2fd7ad8abd2da8de964224c54480dedb27f6567ba0653529731a` without changing its fixture, patch, inspector or wrapper.

Current main was `ee120e2a0ecfd668efad398bef71f41e6d6e0047`. Normal main incorporation produced baseline head `9982164766c2ac142e800925d18629a6a7ff8409` with main's tree. All 21 original source pins remained identical. The explicit guard amendment changed only the historical main and committed-tree identities. [Its distinct hashes](validation-20261113/source-guard-amendment.json) are retained beside the actual guard.

The baseline and candidate source guards passed. Each checked all 21 source pins, seven protected files, 26 original proposal files, three root dependency metadata/version pins and all 44 retained isolated dependency metadata files. React and ReactDOM were 18.3.1, TypeScript was 5.9.3 and the existing own isolated jsdom was 26.1.0. No installation, fallback or borrowed prefix was used.

Both phases ran the same literal fixture and command from the checkout root:

```bash
NODE_ENV=development NODE_OPTIONS=--max-old-space-size=768 \
AGENT_TABS_SOURCE_ROOT="$PWD" \
ONBOARDING_DOM_DEPS="$PWD/.rea-work/open-in-escape64/proposal-v2/dom-deps" \
timeout --signal=TERM --kill-after=5s 115s nice -n 19 \
node --test --test-concurrency=1 --test-reporter=tap \
"$PWD/.rea-work/settings-tab-label64/source-v1/agentTabLabel.dom.test.mjs"
```

- [RED raw TAP](validation-20261113/red.stdout) reproduced the defect. Exit 1, all eight cases collected, exactly six intended `ERR_ASSERTION` failures and two passing controls. Cases 1 and 6 failed the nonempty-ID assertion. Cases 2 through 5 failed the selected-tab reference assertion. No setup, import or control failure occurred.
- The sealed patch applied without changes. The candidate source guard passed.
- [GREEN raw TAP](validation-20261113/green.stdout) passed. Exit 0, all eight cases passed with identical inputs. Both phases had zero skips, cancellations and TODOs, and no result-line directives.
- The unchanged strict inspector accepted both phases. Its SHA-256 is `d70c42346c29cdfa805816bc97f262043316a5569f3bd68b19d807fa02e76b43`.
- Final candidate guard and `git diff --check` passed.

The fixture exercises production AgentsPage, AgentTabRow, providerTab, kitModel and keybinding modules through a real React/jsdom mount. Provider panels, external actions and settings-path discovery are inert boundaries. Two pages share one root and have disjoint IDs. Selection remains URL-global. No remount-stability or exact generated-string assertion is made.

The published fixture is byte-identical to the admitted fixture, SHA-256 `1b71c9d3a01ff6661914b6867f4dc1e5f2a269d7e898ec82c652f427c29cca87`. The separate publication wrapper is also unchanged, SHA-256 `2b8aaaf1ba4515ec069f2db1393ea721dc812e762eceaefa417979f2a15663b1`. Frozen22, its canonical and scratch inputs, and Original11 remain unchanged.

## Resource release

[The raw terminal receipt](validation-20261113/terminal-receipt.json) records actual start at 2026-11-13T02:27:55.642269Z and terminal release at 02:28:10.787495Z. Total elapsed time was 15.145179 seconds within the 360-second cap. The raw source-command counter was 1.201131 seconds. [Inclusive accounting](validation-20261113/inclusive-accounting.json) conservatively includes the initial tool handoff and all gaps, giving 10.148955 seconds of non-test time plus cleanup, within the shared 60-second cap.

All owned child processes were reaped. A post-run process read found no owned Node, npm, Vite, Playwright or Cargo jobs. Owned jobs, servers and support processes were empty. The own dependency prefix was retained. Peak RSS was not sampled.

## Verification limits

The publication wrapper, full adjacent suite, typecheck and build were not run locally because the finite allocation excluded them. Exact-head hosted CI must validate the published wrapper and the existing K1 wrapper before merge. This document records local evidence only, not a later hosted result.

Browser, physical keyboard, screen-reader accessibility tree, native app, live provider, credentials, screenshots and containing-package behavior were not exercised. No screenshot is supplied because browser/native execution was excluded. jsdom passing does not establish native visible behavior.

Containing-package and release follow-through stays with existing owner `992a715e-aafd-49b0-88ba-9cabca1a3126`, ACC serialization and existing native acceptance owner `e1e2b6b9-97cc-4ddc-ba9e-533d89eeeb46`. No duplicate package or native worker is created by this change.
