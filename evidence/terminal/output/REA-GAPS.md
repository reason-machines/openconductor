# REA gaps for the script-output pass

No new REA capture/comparison failure was encountered. Both `capture-browser-scenario` calls completed with screenshots and an empty `issues` list. Both exact and channel-threshold-24 comparisons completed.

The existing JS-analysis limitation remains: REA's graph does not model Tauri invoke calls or Zustand runtime stores. See [run-scripts REA gaps](../../run-scripts/NOTES.md#rea-gaps-hit). This pass therefore read focused symbols from the already-extracted shipped chunk and corroborated the running-output view with REA browser captures.

Offsets copied from earlier notes did not locate `nro` because those approximate offsets mixed character and byte positions. This pass searched function names, calculated byte offsets from UTF-8, and recorded both when relevant. This is an evidence-navigation limitation, not a newly observed REA parser bug.

The mocked browser boundary does not prove native PTY execution, macOS rendering, process exit, or successful setup. The fixture deliberately leaves the reference process running. Those are verification gaps, not failures of the REA capture tool.
