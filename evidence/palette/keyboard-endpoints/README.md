# Palette Home and End navigation

Conductor Rebuild fixed plain Home and End in the command palette. They now select the first and last result. The existing index movement already supported both operations, but the input handler never dispatched them. Modified Home/End behavior is unchanged.

## Reference

The retained Conductor 0.87.6 frontend asset `renderApp-D_fmY7hW.js` was rehashed in this Session: SHA-256 `5199d392ef2dec92886393f181bc98531efc6251f75b9effecd9f60dc9515dde`. Its provenance is the previously extracted macOS binary, SHA-256 `0ba55751aea5ecf592d2c78379760af641fb912a34b2c3573d41df031ffb831d`.

Fresh REA 6.8.0 static analysis of the bounded inert cmdk slice produced Evidence `ev_80462e2fd26b0ef097493b26e04d5fb1bbe05ce141ca11123de7d522cefb777e`. The source handles `Home` with `X(0)` and `End` with `te()`, where `te` selects `K().length - 1`. Static analysis alone does not prove execution.

A separate Open Browser Use check drove the extracted Conductor renderer with fresh invented data: opening Projects left no row selected, Enter kept the dialog open, End selected the final `dotfiles` row, and Home selected the first `tide-web` row. These direct CDP keyboard observations corroborate the endpoint behavior. No native app was launched. Initial Projects selection is not changed in this correction.

## Checks

- `node --test src/palette/state.test.ts`: before, 5 passed and 2 failed because Home/End returned `null`; after, all 7 passed. The regression covers distinct row positions, no current selection, an empty result list, and unchanged modifier handling. See [before](unit-before.tap) and [after](unit-after.tap).
- `node --test --test-concurrency=2 'src/**/*.test.ts'`: all 1,340 tests passed.
- `npm run typecheck`, `npm run lint:colors`, and `git diff --check`: passed.
- `npm run build`: inconclusive before the correction; the 120-second command deadline expired during Vite transformation on the busy shared cloud machine. No build success is inferred.

## Evidence limits and tool gaps

The temporary reference/dev middleware intercepted reference stylesheets. Its screenshot was opened and found unstyled, so it is excluded from visual-parity evidence. Endpoint behavior was read from the actual selected DOM rows, not inferred from that image. No final-head OpenConductor browser screenshot is included yet.

The first fresh REA browser scenario timed out waiting four seconds for Home. After increasing that startup allowance to twenty seconds, both reference scenarios reached the seventy-second subprocess deadline without a completed result. These attempts are not passing captures. The earlier REA issue—exit zero despite failed/cancelled scenario steps—remains relevant; an exit code alone is not counted as success.

The bounded cloud slot ran 19:09:43–19:13:49 UTC on 7 November 2026, with one stopped restart. [The final receipt](preview-stop.json) confirms the owned server process group ended. The slot was explicitly returned to the Diff owner. Native behavior, real authentication, clipboard, real IME, and full-screen parity were not run.

[Machine-readable checks](checks.json) retain source identity, the REA record hash, observations, and limits.
