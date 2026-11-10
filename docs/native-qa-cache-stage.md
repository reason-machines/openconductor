# Synthetic storage lifecycle stage

This QA-only stage exercises synthetic localStorage, IndexedDB and CacheStorage
writes and reads them back. It then exits, terminates only its own process group,
relaunches the exact same QA binary/configuration and requires all three synthetic
stores to be absent. It never runs ordinary application content or providers.

## Scope and hard boundary

A passing storage-stage receipt is **not filesystem/cache isolation proof**.
There is no trusted process/helper filesystem observer in this increment.
`filesystem_coverage_verified` and `ordinary_app_content_admitted` remain false;
`require_filesystem_isolation` rejects every receipt, including one that claims
complete coverage. Neither this tool nor the ordinary prerequisite gate consumes
a storage-stage receipt to unlock ordinary startup.

`close_fds=True` avoids passing ambient file descriptors to the subprocess.
Process-group timeout/cleanup targets only that subprocess group. These controls
do not establish coverage of XPC-launched WebKit helpers or their filesystem
writes. A filesystem snapshot cannot account for transient writes. The presence
of deprecated `sandbox-exec` does not establish a valid path policy, confinement
of all helpers, or safety of already-open writable descriptors. Do not promote
any of those observations to a whole-app safety claim.

## Native execution unit

This document is not a launch grant. Execution belongs exclusively to the
coordinated native owner, in a unit that specifically includes synthetic storage
content. An inert `about:blank`-only execution unit does not include these writes.
Do not build or launch on the Mac from a parallel source or browser lane.

1. Use the exact containing merged source and a fresh private QA fixture following
   [the isolated build procedure](native-qa-isolation.md). Never use the installed
   app, real credentials, preserved data, existing app processes or a previous
   runtime fixture.
2. Build the random-identity macOS debug bundle with local bundled assets, one
   `main` window and the default `index.html` target. Dev-server, remote asset,
   multi-window, nondefault target and release configurations are refused.
3. Produce the exact-binary path receipt, then the
   [ordinary inert prerequisite receipt](native-qa-webkit.md). A stale binary,
   configuration or source identity is refused before the storage subprocess.
4. Only in that separately scoped native unit, run the wrapper:

   ```bash
   python3 tools/native_qa_cache.py "$qa" \
     "$qa/target/debug/bundle/macos/OpenConductor QA.app" \
     --execute-synthetic-storage-stage
   ```

The wrapper runs sequential `write` and `read` subprocesses with isolated
environments, a shared random non-secret fixture identity, distinct PIDs, closed
ambient descriptors and bounded timeouts. It filters provider credentials.
No shell command, provider or arbitrary URL comes from a receipt.

The native stage starts hidden at inert `about:blank`, inspects the actual
WKWebsiteDataStore after construction on the main thread and refuses persistence
or a visible window. Only after inspection does it navigate that same webview to
a QA-only synthetic protocol handler. This handler replaces bundled application
assets only inside the separate minimal stage builder. It exposes no ordinary
application commands. It never loads the real app page. The synthetic payload
uses Cache.put with an in-memory Response; it does not fetch the synthetic URL.
Missing secure storage APIs, blocked transactions or failed read-backs fail the
whole stage instead of silently skipping a store.

## Acceptance and retained failure evidence

- `storage-write.json`: all three stores report `written-read-back`.
- `storage-read.json`: all three report `absent` in the distinct relaunched PID.
- `cache-storage-stage.json`: exact source/binary/configuration hashes, both stage
  receipts and `storage_lifecycle_verified=true`, but
  `filesystem_coverage_verified=false` and
  `ordinary_app_content_admitted=false`.

Every file is private. A failed second phase can leave the first phase's receipt
for diagnosis but must not create the aggregate receipt or permit fixture reuse.
Old binaries, mismatched prerequisites, a changed executable/configuration,
ordinary-store creation, missing native observations and timeouts are refusals.
Fixture-test receipts are not native evidence.

The next missing prerequisite is an actual bounded observer that establishes
coverage for the app and relevant helpers without collecting unrelated user
activity. It must account for startup, child/XPC lifecycles, inherited descriptors,
transient writes, dropped events and observation errors. If coverage cannot be
established, report that limitation and leave admission closed; do not add an
environment override or accept a manually asserted coverage JSON.

## Cloud checks (no native execution)

```bash
python3 -W error::ResourceWarning -m unittest tools/test_native_qa_cache.py
node --test tools/test_native_qa_storage.mjs
rustc --edition 2021 -D warnings --test --cfg workspace_std_only \
  src-tauri/src/native_qa_cache.rs -o /tmp/native-qa-cache-tests
/tmp/native-qa-cache-tests
```

These exercise fixture programs, a synthetic API model and pure Rust boundaries,
not macOS WebKit, filesystem observation or visual parity.

## Integration and exact dependency source checks

`native_qa::before_startup` dispatches the storage probes only after the existing
QA configuration/environment guard, before the ordinary builder and plugins.
The four exact probe flags (`--oc-qa-paths`, `--oc-qa-webkit`,
`--oc-qa-storage-write`, `--oc-qa-storage-read`) are exclusive: every duplicate
or pair is refused before startup. Storage probes refuse release and nonmacOS
builds, missing roots, nonrandom QA identities and any directory override other
than the exact prepared root's `app-data`. No storage receipt changes the
ordinary prerequisite gate. The wrapper rechecks executable/config hashes and
ordinary stores before **each** subprocess and after the read stage.

The following dependency archives were downloaded from static.crates.io and
verified against their exact `src-tauri/Cargo.lock` checksums on cloud; these are
source/signature checks, not native execution:

- [Tauri 2.12.5 `register_uri_scheme_protocol`](https://docs.rs/tauri/2.12.5/src/tauri/app.rs.html#2267-2287):
  synchronous `Fn(UriSchemeContext, Request<Vec<u8>>) -> Response<T>` with a
  `Send + Sync + 'static` handler. `Vec<u8>` response bodies meet the signature.
- [Tauri 2.12.5 webview manager](https://docs.rs/tauri/2.12.5/src/tauri/manager/webview.rs.html#230-286):
  custom `tauri` registration suppresses the default bundled-asset handler;
  the separate core `ipc` protocol remains. Initialization scripts are prepended
  independently of the bundled-asset handler (lines 159–226). This stage registers
  no ordinary application plugins or command handlers.
- [Tauri 2.12.5 `WebviewWindow`](https://docs.rs/tauri/2.12.5/src/tauri/webview/webview_window.rs.html):
  `from_config` (150), navigation callback `Fn(&Url) -> bool` (266),
  new-window callback returning `NewWindowResponse` (315), `with_webview`
  accepting `FnOnce(PlatformWebview) + Send + 'static` (2498), and
  `navigate(Url) -> Result<()>` (2511).
- [tauri-utils 2.10.2 configuration](https://docs.rs/tauri-utils/2.10.2/src/tauri_utils/config.rs.html):
  `AppDirectoriesOverride::Root(PathBuf)` and `app_directories_override`;
  the storage stage rejects the per-directory form rather than weakening the
  exact-root requirement.
- [Wry 0.57.1 WKWebView construction](https://docs.rs/wry/0.57.1/src/wry/wkwebview/mod.rs.html):
  incognito selects `nonPersistentDataStore` (274–278). This is the requested
  mechanism, not proof that a real run obtained it; the stage also observes the
  constructed datastore before permitting synthetic navigation.
- objc2-web-kit 0.3.2 generated `WKWebView.rs:174`,
  `WKWebViewConfiguration.rs:175`, `WKWebsiteDataStore.rs:60`:
  `configuration`, `websiteDataStore`, `isPersistent` are unsafe methods;
  calls stay inside the main-thread checked live-view callback and unsafe block.

CI runs Python and JavaScript fixtures, pure startup/storage Rust tests on Linux
and macOS, and the existing full Tauri check/test/clippy matrix on this PR's head.
It does not authorize or perform the synthetic native runtime recipe above.
Actual WebKit execution, filesystem/helper observation, Settings parity and the
#773 picker are **NOT RUN** by this source increment. No screenshot is supplied:
no ordinary UI was changed, and native launch is explicitly outside this lane.
