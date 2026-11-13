# K1 product-checkout command proposal, revision 2

Conductor Rebuild. Proposed only. No ACC admission, execution row, runtime request, installation, product application, or test execution is created by this document.

## Scope disposition

Ledger message 571e9516-1f69-4892-a53d-b70765a7d89f confirms SAME64 owns only AgentTabRow keyboard and focus in src/settings/agents/kit.tsx and its AgentsPage caller. There is no competing recorded owner for this hunk. Settings49 environment and updater work and SAME15 shared menus and Dialog shells remain excluded.

K1 is distinct from original11. Original11 a9e54829 remains the single LAST Escape/OpenInEscape/newkit row. Its fixture, patch, proposal-v2 files, assertions, budget, and queue position do not change. K1 has no execution row. Neither this proposal nor an original11-only grant admits K1.

ACC must explicitly accept a K1 contract and name K1 in a direct grant before setup, dependency inspection, imports, tests, or product application. Source coordination request c74f9f0b-476d-434b-9cbe-a4ea46440f9d asks for existing feedback only. It is not a readiness request.

## Change from revision 1

Revision 1 proposes two sparse-snapshot runs and explicitly cannot verify a product-checkout correction. Revision 2 proposes replacing those two runs with RED and GREEN on the actual assigned checkout, using the same frozen 22-case fixture and patch. It does not add runtime to original11 or silently admit product application.

The proposed K1-only ceiling remains 360 seconds. All non-test work, including setup, source binding, product application, and phase-result inspection, shares 60 seconds. RED gets 120 seconds, GREEN gets 120 seconds, and cleanup gets a 60-second reserve. Do not begin GREEN unless at least 180 seconds remain. ACC may reject this replacement. Until ACC accepts it, neither revision is executable.

No original11 runtime check is included. K1's frozen Escape control exercises the real global settings.close dispatcher, not the unopened OpenInSplit menu and not original11's eleven assertions. A K1 pass gives no original11 credit.

## Current source binding

The source was read on Reason Cloud at main 06500f5ef1230513090e42aebe0222fd4f83a72d. All 18 production modules pinned in K1 revision 1 remain byte-identical. App.tsx and SettingsView.tsx also match their earlier c313e39f source. The branch remains reason/task-64baa6b6. No tracked product file has changed.

The retained REA witness is Conductor 0.87.6 renderer 5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde, evidence ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2. Its literals declare automatic activation, horizontal wrapping, Home and End navigation, focus selection, and one tab stop. This is static evidence, not observed key presses. No reference JavaScript is evaluated.

The current consumer path remains App's Settings return, SettingsView, AgentsPage, AgentTabRow, and the providerTab URL store. Settings binds settings.close. The real KeybindingsProvider capture path dispatches registered commands but does not select provider tabs. Default app-shell shortcuts do not assign bare horizontal arrows, Home, or End to provider navigation. The fixture mounts the real AgentsPage, row, URL store, and keybinding modules, with inert provider panels and external-action boundaries. It does not mount the complete App or SettingsView.

## Sealed inputs

- Frozen fixture: ../agentTabsKeyboard.dom.test.mjs, SHA256 833644d93d3c45c4846800c2d923540ff53c57b22d2aa1f53aaf99dbc1789d51.
- Frozen patch: ../keyboard-candidate-v1/candidate.patch, SHA256 722b674f6f6ea92dd9ae95b9f352589195c8192ae2da384c1b0f1db36a46fd7a.
- Expected RED is exit 1 with precisely 11 failures and 11 passes. Failing case numbers are 1 through 10 and 22. These are predictions, not results.
- Expected GREEN is exit 0 with 22 passes. Both phases require 22 tests, zero cancelled tests, zero skips, and zero TODOs.
- Failure names and outputs must be inspected. A loader error, setup failure, timeout, OOM, missing case, extra case, different failure, or forbidden external call is not product RED.

The fixture and patch are not copied over their originals or rewritten. Published regression evidence must retain these exact inputs and their verification limits. A later CI integration or loader adaptation needs its own explicit source review. It cannot replace the admitted local result.

## Proposed exact commands

These blocks are for review. None has executed. An execution would use one foreground tool call and a 360-second enclosing deadline. No preview server, background process, additional executor, guest dependency path, dependency installation, or dependency search is allowed.

After a direct grant naming this revision, the caller sets these values in the assigned checkout:

```bash
set -eu
MAIN=06500f5ef1230513090e42aebe0222fd4f83a72d
K1="$PWD/.rea-work/settings-tab-census64/keyboard-candidate-v1"
FIXTURE="$PWD/.rea-work/settings-tab-census64/agentTabsKeyboard.dom.test.mjs"
PATCH="$K1/candidate.patch"
export NODE_ENV=development
export NODE_OPTIONS=--max-old-space-size=768
export ONBOARDING_DOM_DEPS="$PWD/.rea-work/open-in-escape64/proposal-v2/dom-deps"
export AGENT_TABS_SOURCE_ROOT="$PWD"
```

Setup is bounded to 45 seconds with at most 5 seconds to terminate, leaving 10 seconds of the shared non-test allowance for patch application and result inspection. Check only the exact own-checkout dependency paths. React, ReactDOM, and TypeScript must match the versions in the pinned project lockfile. The isolated jsdom must be version 26.1.0. No import or installation is part of these checks. Missing own dependencies cause SETUP_FAILED and RELEASE, not fallback to another Session's dependencies.

```bash
[ "$(git branch --show-current)" = reason/task-64baa6b6 ]
[ "$(git rev-parse origin/main)" = "$MAIN" ]
git diff --quiet
git diff --cached --quiet
git merge --no-edit "$MAIN"
git diff --quiet "$MAIN" HEAD
python3 .rea-work/settings-tab-census64/keyboard-contract-v2/check-binding.py --product
[ -f node_modules/react/package.json ]
[ -f node_modules/react-dom/package.json ]
[ -f node_modules/typescript/package.json ]
[ -f "$ONBOARDING_DOM_DEPS/node_modules/jsdom/package.json" ]
python3 - <<'PY'
import json, os
from pathlib import Path
lock = json.loads(Path('package-lock.json').read_text())['packages']
for name in ['react', 'react-dom', 'typescript']:
    path = Path('node_modules') / name / 'package.json'
    assert json.loads(path.read_text())['version'] == lock[f'node_modules/{name}']['version'], name
prefix = Path(os.environ['ONBOARDING_DOM_DEPS'])
assert json.loads((prefix / 'node_modules/jsdom/package.json').read_text())['version'] == '26.1.0'
PY
```

The enclosing execution must record the literal command, UTC start and finish, exit, stdout, and stderr for each phase. A nonzero RED exit is accepted only after the raw output matches all frozen expected failures and controls. No product patch is applied before that inspection.

```bash
if timeout --signal=TERM --kill-after=5s 115s nice -n 19 \
  node --test --test-concurrency=1 --test-reporter=tap "$FIXTURE" \
  > "$K1/red-v2.tap" 2> "$K1/red-v2.stderr"; then
  RED_EXIT=0
else
  RED_EXIT=$?
fi
printf '%s\n' "$RED_EXIT" > "$K1/red-v2.exit"
[ "$RED_EXIT" -eq 1 ]
```

After the expected RED only, check and apply the sealed patch. A conflict or changed source ends the execution without replacing the patch or changing the assertions. Check that only AgentTabRow differs. No menu, provider, keybinding, SettingsView, stylesheet, lockfile, or original11 change is permitted.

```bash
git apply --check "$PATCH"
git apply "$PATCH"
python3 .rea-work/settings-tab-census64/keyboard-contract-v2/check-binding.py --product-candidate
```

Run the identical command and fixture against the corrected actual checkout:

```bash
if timeout --signal=TERM --kill-after=5s 115s nice -n 19 \
  node --test --test-concurrency=1 --test-reporter=tap "$FIXTURE" \
  > "$K1/green-v2.tap" 2> "$K1/green-v2.stderr"; then
  GREEN_EXIT=0
else
  GREEN_EXIT=$?
fi
printf '%s\n' "$GREEN_EXIT" > "$K1/green-v2.exit"
[ "$GREEN_EXIT" -eq 0 ]
```

Stop without retry on unexpected RED, failed GREEN, timeout, OOM, or source mismatch. Cleanup must terminate only the execution's own process group, retain raw outputs and actual exits, record ownjobs[], and send explicit RELEASE within the 360-second ceiling. A patch applied after expected RED may remain as a work-in-progress product diff after a failed GREEN. It is not committed or called verified. No broad restore or rollback of another owner's work is allowed.

## Publication and checks outside this contract

Only a genuine checkout RED and identical checkout GREEN can support the focused product change. They do not prove visible browser focus, native Conductor parity, package inclusion, or provider sign-in. Those remain separate gaps with their existing owners.

Typecheck, build, browser, native, provider, package, original11 tests, adjacent suites, and additional local runtime are excluded. Existing enabled hosted PR checks still have to pass on the exact final head before merge. Runtime ownership is released before commit, ready standalone main PR publication, or CI waiting.

## What ran in this revision

Only source retrieval, source comparison, static patch-boundary verification, and shell syntax parsing are allowed in this source-preparation turn. Results are recorded separately in source-binding.json and syntax-validation.json. No setup, dependency availability check, module import, product patch, test, or application action has run.
