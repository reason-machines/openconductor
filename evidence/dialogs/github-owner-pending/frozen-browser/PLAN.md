# Frozen browser witness plan — before any browser observation

Conductor Rebuild, SAME6013. One static preview at port 48733; one owned Chrome tab; baseline then treatment; at most 15 minutes from admitted actual START; early cleanup after evidence. Browser execution requires separate ledger admission. No original-app, full-App, provider, native/Mac or real repository access.

Actual GitHubRepoDialog, state model, DialogFrame, @base-ui portal, motion, KeybindingsProvider/registry/matcher and production theme/styles are bundled. Identical synthetic backend ports provide two owners, availability and deferred create. An identical thin adapter adds three clearly labelled backend-settlement buttons **inside** the actual DialogFrame; it does not replace its implementation or bypass modal inertness. CSP denies connect, form action, images and frames. Window witness is read-only telemetry; no storage, browser request, fake completion assignment or direct handler/settlement call from browser tools.

Freeze all fixture hashes and both complete dependency/served-file graphs before admission. The only differing product input is the already-frozen baseline vs treatment GitHubRepoDialog. Reload the same page between independent schedules; reuse the single owned tab and server.

Six fixed controls per version:

1. Initial loading: actual Owner and submit disabled, empty selection, no create request.
2. Ready idle: click the observed Load owners fixture control; verify two real options. Change actual select through its native value setter with normal input/change events and read back value. Once availability settles, primary click captures selected team owner and original path/name/origin.
3. Pending editability: load owners, wait for availability, real primary click; captured person request exactly once, Creating/disabled primary, Owner **enabled**. Baseline intended failure; treatment passes. Capture matching before/after pending screenshots.
4. Pending edit/rejection/retry: same pending start; first assert Owner enabled (do not bypass disabled baseline). Change actual Owner to team; first captured request stays person; primary remains disabled even after the new availability check. Real pointer attempt at disabled primary makes no second request. Click observed Reject creation fixture control, verify team draft/error/no close, retry primary captures team, then Resolve creation closes once with team remote. Baseline intended failure at the enablement prerequisite; treatment passes.
5. Rejection control without owner edit: pending person request, real Reject creation button; owner person retained and enabled, primary re-enabled, one error, no close.
6. Resolution control: pending person request, primary still disabled; real Resolve creation fixture button produces one callback/close and removes the live alertdialog. No real GitHub creation is claimed.

All actions target observed DOM controls, real primary/fixture clicks, actual select values and readbacks. Synthetic select input/change dispatch is explicitly not a trusted native picker interaction; real pointer click/submit trust is retained in telemetry. Initial/loading/refetch/error Node controls remain frozen unchanged; no cached background refetch or animation/theme/native parity claim.

Expected baseline: 4 passing controls / 2 intended pending-Owner failures. Expected treatment: 6/6. Preserve every raw readback including failed prerequisites; do not silently skip or normalize owner/disabled/request fields. Close owned tab and stop the preview before deadline; verify tabs empty, preview stopped/listening null, own server processes absent and independent port bind passes; explicitly release the ledger slot.
