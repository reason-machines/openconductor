# Bounded browser witness — CLONE-IMPLICIT-ENTER-6013

Owner: Conductor Rebuild / SAME6013. Admission requires ledger explicit Home release; this file starts no server or browser.

Load actual CloneGitHubRepoDialog + actual DialogFrame + actual KeybindingsProvider; empty overrides mean current registry default Meta+Enter. Replace only backend/workspace API imports at bundling boundary. No Tauri/backend imported. CSP forbids outgoing connections and form navigation. Clone returns a never-settling synthetic promise; no checkout, persistence, provider or native bridge.

Freeze before input: fixture sources, bundled graph/source hashes, current main and full retained-reference bindings. Never call onSubmit or button.click from test code. Use browser tool normal keyboard event path and inspect isTrusted/defaultPrevented trace.

Controls, each via fresh navigation to reset app state:
1. Native form capability URL Enter and location Enter: each submits once; click remains live.
2. Actual dialog valid synthetic URL+location: plain Enter URL, then separate location. Expected parity contract is zero clones; baseline observation may fail.
3. Actual valid URL Meta+Enter and location Meta+Enter: exactly one inert clone each; primary click exactly one.
4. Actual blank URL plain Enter and Meta+Enter: zero clones and disabled button.
5. Pending plain Enter, Meta+Enter and click must not duplicate a first inert call.

Inputs only https://example.invalid/fixture.git and /synthetic/clone-root. Read actual values and activeElement before keyboard. Record user agent, event evidence, JSON trace and screenshot. No WebKit/macOS equivalence claimed from Chrome.

Cleanup immediately after bounded witness: close only own tab, stop only own preview ID, verify preview stopped plus port not listening and no fixture process, notify ledger release. Keep source/frozen evidence; delete only rebuildable bundle/deps after evidence retention when appropriate. No native/package/app runtime or watcher. If wait still pending, report fixture ready and admission missing, do not start it.
