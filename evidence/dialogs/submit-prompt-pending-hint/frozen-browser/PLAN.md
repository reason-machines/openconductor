# Frozen six-control browser plan

Conductor Rebuild / SAME6013. Written and hashed before the first browser observation.

One own static preview on port 48733 and one own managed Chrome tab; baseline and treatment use the same six controls, immutable fixture entry/IO/styles/plan, identical module graph, and the same synthetic data. Maximum 15 minutes from actual runtime start; close tab, stop preview, verify stopped/listening-null/own-processes-empty/independent bind and release early when done. Browser runtime begins only after the explicit ledger admission and fresh occupancy receipts.

Use the actual observed inputs. Set normal input values with the native value setter and bubbling input/change events; read actual values back. Activate only observed buttons with real mouse input, never invoke component callbacks in the browser. Only the fixture's observed Reject/Resolve buttons settle its synthetic deferred opener. No fabricated storage, network, request or completion state. Capture readbacks and trusted click/submit flags unchanged; preserve both outcome failures and controls.

Each control starts on its own fresh navigation to baseline.html or treatment.html; custom control adds `?shortcut=custom`. Actual appVersion `0.test` and platform `synthetic` are intentional fixture values. Prompt is `Keep this synthetic prompt`; name is `Test Author`.

1. **Idle default:** prompt/name empty; default hint `⌘↵`, primary disabled; zero requests/closes/errors.
2. **Default pending:** fill/read both fields; real click primary; one synthetic URL request, no close, both fields and button disabled, text exactly `Submitting...`, no hint. Expected baseline mismatch: hint `⌘↵` remains.
3. **Custom pending:** same as 2 on the custom route; idle hint `⌘D`; expected baseline mismatch: hint `⌘D` remains. Treatment must hide it.
4. **Rejected draft:** fill/read, real primary click, real fixture Reject click; one request, no close; alert visible; prompt/name unchanged and enabled; default hint and idle label restored, primary enabled.
5. **Resolved opener:** fill/read, real primary click, real fixture Resolve click; one request and one close; actual dialog absent. Resolving the synthetic opener is not a real issue submission.
6. **Blank prevention:** leave required prompt empty; real pointer click on observed disabled primary; zero requests/closes; dialog and default hint remain, primary disabled.

Expected baseline 4/6 passes with only controls 2/3 failing; treatment 6/6. Keep original readbacks and screenshots of both pending states. The inert fixture uses the actual motion hook and actual production CSS/tokens, but this is not original-app, animation, full-app, default-theme, native/WebKit, real backend/provider, installed package or final parity acceptance. No original JavaScript is executed.
