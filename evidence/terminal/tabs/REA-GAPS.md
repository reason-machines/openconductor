# REA capture limits

Conductor's retained frontend extraction and its known React-hook and cross-chunk semantic-analysis limits are recorded in [terminal evidence](../NOTES.md) and [Find evidence](../find/REA-GAPS.md). This pass performs no new native analysis.

Two rejected browser scenarios were corrected before the final captures:

- Evidence `ev_faa75a03be4a350ac01cf26d4737117768a8c5771a4181d74a66004991e9af61`: the multiple-terminal scenario reached the expected close action, then `.xterm-rows` matched two retained terminal renderers. REA correctly rejected the ambiguous wait with a strict-mode violation. The final wait selects the first visible renderer. The rejected capture is not used as passing evidence.
- Evidence `ev_c2d2fdf91729682b71bccaac5e1c25effd47bff35f0962b1bac99cdff6c93250`: clicking the text renderer to move the pointer off the tab strip timed out because `.xterm-screen` intercepts pointer events. The final scenario clicks that observed screen element instead. This was a locator correction, not an REA or product defect.

An earlier single-terminal capture `ev_70c5ba3a5e0fb30bf89c1cc662c330acb221e5f21f6c3c7804cadfde5d2586e8` succeeded but left the pointer over the tab's hover-close overlay, clipping its label. The final scenarios focus the terminal screen before the screenshot. Rejected raw payloads remain scratch artifacts and are not substituted for final evidence.

Browser fixture observations do not prove native PTY behavior, installed-package identity, a signed-in agent turn, or whole-screen visual parity.
