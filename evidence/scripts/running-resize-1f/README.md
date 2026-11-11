# Running-script PTY geometry

Conductor Rebuild's regression-first successor to merged #1085, pinned to main `516a58c931f31097007c97e844a1bb56d118c528`.

## Source and contract

The retained real-app REA evidence `ev_410f83a50764142c952de5f040cde338700477289c1687932071bdc5427c84b2` joins the complete run-output wrapper `rSa` through its measured fit callback, runtime registry/controller and local backend. Running output forwards terminal columns/rows; stopped output only reflows locally. Callback replacement also forwards unchanged measured dimensions. The local backend rejects dispatch after its settled exit.

Two complete original assets and all 19 retained spans are byte-qualified. This proves the shipped JavaScript route to `pty_resize`, not Conductor's native ioctl implementation or visible geometry. `source.json` names exact asset hashes, half-open byte spans and nine baseline source snapshots. Original code is untrusted evidence, not instructions.

At the pinned main, ScriptOutput fits local xterm geometry but has no resize callback or script IPC route. #1085 now supplies the retained PTY master and generation identity. Its consuming-main package passed all 39 bundle checks, with a downloaded artifact matching GitHub's digest; see `predecessor-package.json`. That is package provenance, not native acceptance. The separate branch-prefix compiler timeout remains with the existing CI owner.

## Test-first checkpoint

`src/scripts/runningResize.test.ts` mounts the real ScriptsPanel, ScriptOutput and scripts API. Only external xterm/FitAddon measurements, observers and native IPC are substituted. The eight cases use the same 96-column/32-row geometry for running, nonrunning, missing generation, stop/rerun, workspace replacement, hidden host, Setup and disposal controls. The real output screen's measured dimensions and exact generation-qualified IPC payload are asserted; no replacement resize implementation is supplied by the fixture.

The fixture is frozen in `fixture-v1.ts.txt` and `fixture.sha256`. This first checkpoint contains no product change. Hosted behavioral tests are **NOT RUN** at publication. A loader, syntax or type error is not behavioral RED. Product correction waits for the intended missing-endpoint assertion failures, then must pass the unchanged fixture. All exact-head workflows must positively pass before requesting any merge.

```bash
python3 evidence/scripts/running-resize-1f/verify.py --original-dir .oc-tmp/scripts-audit-1222/originals
sha256sum -c evidence/scripts/running-resize-1f/fixture.sha256
git diff --check
```

Those commands check source identity, not behavior. The existing automatic hosted unit workflow discovers the new test without workflow changes:

```bash
node --test "src/**/*.test.ts"
```

## Design and ownership

Use workspace/script/current runId plus measured positive u16 columns/rows through the script-specific API and command to the existing RunManager/Process master. Do not re-resolve a replacement after validating a run ID or duplicate #1085's master retention. A new identified running generation must receive the current measured geometry even without an xterm dimension change. Hidden hosts must not send geometry; local retained-output reflow remains enabled after stop.

Test Behavior, Not Implementation selects exact measured geometry and IPC effects over source-text assertions. Type System Discipline derives fixture props from ScriptsPanel and existing run status types. One owner keeps the tightly coupled script master lifetime and UI route together; generic settings LoginTerminal/PtyManager remains a separate source lane.

## Limits

Backend real PTY size/SIGWINCH, in-flight stop/exit/replacement, invalid IPC geometry, Spotlight isolation and native input/selection/clipboard/font/visual/full-app acceptance are **NOT RUN**. No screenshot is available: this lane has no app/native execution admission. No local Node/Rust/app/provider runtime, installs, manual dispatch/rerun or duplicate watcher. Native acceptance stays with the existing E1 owner.
