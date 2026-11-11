# Kaleidoscope workspace launch regression

Owner: Conductor Rebuild, Session 15faf4d8-d257-49ef-874d-8008c5c78aaf.

## Source-qualified difference

Main `248b6c359c830c6ac5e050721bae18e44e168068` always opens a Kaleidoscope
workspace with `open -a Kaleidoscope <dir>`. The retained Conductor 0.87.6
renderer has a separate `uD` branch that first probes changes against HEAD.

- `git -C <dir> diff --quiet HEAD` completed with code 1 runs Git's Kaleidoscope
  difftool with `--partial-changeset` and the literal `$MERGED`, `$LOCAL`, and
  `$REMOTE` arguments in its configuration.
- Probe code 0 or another completed status opens the folder instead.
- A completed nonzero difftool status falls back to opening the folder.
- A probe or difftool transport error does not trigger that fallback.
- `I8` and `wBt` prepend `OGe` to difftool and folder-open commands. The probe
  uses the inherited PATH. The exact catalog suffix is `Contents/MacOS`.
- `wBt` reports nonempty stderr, then stdout, then the exit code, without trimming.

[The source receipt](source-receipt.json) identifies the retained REA lineage,
full shipped renderer hash, eight exact byte joins, and fixture hash. Existing
`ICi`, `P9`, `uD`, `I8`, `o4e`, and `OGe` literals remain in the merged Alacritty
evidence unchanged. The new catalog and `wBt` literals are in [reference](reference).
This is retained compiled source evidence, not a fresh native observation.

## Paired behavioral checks

The baseline adds only a Mac-only test module and evidence. Production launch
code is unchanged. Eight tests exercise the real `commands::open_in_app`
entrypoint in isolated test subprocesses, using temporary recording `git` and
`open` shell shims. Each subprocess has its own PATH and HOME. No macOS app is
installed or launched. The parent verifies that the child ran exactly one test.

K01 through K08 cover dirty HEAD, clean HEAD, other completed probe statuses,
difftool fallback, fallback diagnostics, probe transport error, difftool
transport error, and stdout/exit-code diagnostics. Recorded argv and PATH are
asserted for every invocation. Paths include spaces and quotes. Candidate runs
exercise eleven cases in these eight tests. The fixture must remain byte-identical.

- Baseline hosted behavioral RED: pending.
- Candidate hosted behavioral GREEN: not run.
- Local app, Node, browser, and native execution: not run.

Normal hosted CI runs `cargo check --locked --all-targets`, `cargo test --locked`,
and `cargo clippy --locked --all-targets -- -D warnings` from `src-tauri`.
A compile error, missing fixture, timeout, or infrastructure failure is not RED.
The existing frozen Alacritty tests and all other launcher tests stay unchanged.

Source verification:

```bash
python3 evidence/open-in/kaleidoscope/verify_source.py
python3 evidence/open-in/kaleidoscope/verify_source.py --renderer <retained-renderer>
```

## Limits

No native launch, actual `ksdiff` execution, packaged PATH, menu, or side-by-side
parity claim follows from these hosted stand-ins. File targets, other launchers,
cloud UI, ICON15, Move12, M11, and Settings49 are outside this change. The five
missing original native menu function bodies remain unverified. Runtime ownership
and admission remain unchanged.
