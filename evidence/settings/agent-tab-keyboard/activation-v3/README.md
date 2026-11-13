# K1 activation after the inactive checkpoint

Conductor Rebuild corrected two source prerequisites against main `bffafc81a2ab3608abd94a7c612da1a14785aafe`. Production, discovery, workflows and dependencies remain inactive and unchanged. This directory does not admit execution or establish keyboard behavior.

## Reuse the tracked fixture

PR #1199 added the sealed fixture at `evidence/settings/agent-tab-keyboard/agentTabsKeyboard.dom.test.mjs`. The archived `../publication.patch` still creates that same path from `/dev/null`. Its literal source projection now rejects the existing target, even though its contents are identical.

`activation.patch` is exactly the archived publication patch without its redundant fixture-creation section. It retains the original workflow provisioning and wrapper bytes. Its only proposed targets are `.github/workflows/ci.yml` and `src/settings/agents/agentTabKeyboard.test.ts`. It reuses, rather than replaces, the tracked fixture. The archived proposal remains unchanged for provenance.

The isolated jsdom setup still precedes both discovery steps. No assertion, case order, fallback, skip, trigger, job, runner, permission, project dependency or lockfile changes.

## Bind the actual current checkout

The historical revision-2 binding script hardcodes main `06500f5ef1230513090e42aebe0222fd4f83a72d`. That identity remains historical, not an execution binding for a later grant.

`verify_source.py` requires a full freshly fetched `origin/main` SHA. It compares all 21 existing pins against that main and the working checkout. It also verifies the original packet hashes, the already-tracked frozen fixture, the absent active wrapper and the exact sealed product correction. A changed source pin fails closed; passing a newer SHA never permits a source mismatch.

The verifier projects both patches into memory. It writes no product file or Git index, imports no application module and inspects no dependency directory. Its baseline phase expects unchanged product files. Its candidate phase expects only the sealed `kit.tsx` correction. Neither phase runs the fixture or supplies behavioral credit.

```bash
python3 -B evidence/settings/agent-tab-keyboard/activation-v3/verify_source.py \
  --main "$(git rev-parse origin/main)" --phase baseline
```

At a direct ACC grant, the proposal is to replace only the stale binding calls in the existing setup and post-patch checks with this verifier's `baseline` and `candidate` phases. ACC must reconcile that amendment within the existing K1 entry before execution. No runner or intake is added. The existing limits remain 360 seconds total, two hard 120-second test phases, 60 seconds shared non-test work and 60 seconds cleanup; GREEN needs 180 seconds remaining. Execution remains sequential, `nice 19`, heap 768 MiB, no local installation.

The RED/GREEN fixture and production patch remain byte-identical:

- Fixture SHA256: `833644d93d3c45c4846800c2d923540ff53c57b22d2aa1f53aaf99dbc1789d51`.
- Decompressed production patch SHA256: `722b674f6f6ea92dd9ae95b9f352589195c8192ae2da384c1b0f1db36a46fd7a`.
- Activation patch SHA256: `08cbdc5bec20ca69a105ccc3ce8d3394d1274562313e1cf6634988afc55c1eaf`.

Apply neither activation nor production corrections in a source-only turn. Qualifying actual-checkout RED and identical GREEN still precede product publication. Workflow and wrapper activation belong to the subsequent focused product PR, whose exact-head hosted checks must all pass. Original11 stays separate, frozen and LAST.

## Source checks and limits

On Reason Cloud, the source verifier passed at the main named above. It reproduced rejection of the archived duplicate fixture, verified the activation projection, and verified the sealed production projection against its original candidate hash. An obsolete-main negative control was rejected. The original checkpoint verifier and `git diff --check` also passed.

These are source checks, not K1 RED/GREEN. No Node, TypeScript, wrapper, DOM fixture, package installation, YAML parser, build, browser, native, provider, login or credential operation ran. Candidate-phase checkout verification remains unrun until the admitted correction is actually applied. No screenshot or deployment applies because no active application behavior changes.

[The original checkpoint](../README.md) retains REA provenance and its native-focus limitations. This amendment makes no new claim about Conductor and evaluates no extracted reference JavaScript.
