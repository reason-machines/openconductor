# Observe the QA WebKit datastore

This is a separate native runtime step, not an extension of the headless path
probe's execution grant. Do not run it until the coordinated native evidence
owner has reviewed the exact source/build and received authorization for the
hidden WebKit instance. It must not use installed apps, preserved application
data, credentials or existing native processes.

## What this probe can establish

The QA-only mode uses a minimal application, not ordinary OpenConductor startup.
It requests a hidden, nonfocused window with an inert `about:blank` bootstrap,
requests JavaScript disabled, and denies navigation and new-window requests.
It inspects the actual WKWebView configuration's website datastore on the main
thread and refuses a persistent datastore or visible window.

Tauri's public `with_webview` observation happens **after** webview construction.
The inspection therefore occurs after the inert bootstrap, before any app
content—not before all navigation. No application page, script or remote URL is
provided. Tauri still installs its core initialization scripts; the probe requests
JavaScript disabled and adds no application initialization scripts. Denying
navigation is not a general network sandbox and does not prove that every
possible WebKit network mechanism is disabled.

A passing runtime receipt would establish the observed datastore property for
this exact probe. It does not establish full filesystem/cache isolation,
production authentication, ordinary application startup, or visual parity.
No success receipt from fixture tests or a compiled build is a native runtime
observation. The ordinary GUI gate remains separate.

## Prerequisites

1. Prepare a fresh private root and build the exact committed source with its
   random QA identity and configuration, following
   [the path-preflight procedure](native-qa-isolation.md).
2. Run the existing `tools/native_qa.py probe` and retain its path receipt,
   build log, source before/after identity, and binary/configuration hashes.
3. Confirm there is no app-data directory and the settings directory is empty.
   Do not import real account files or start providers, terminals or agents.
4. Obtain the coordinated runtime execution authorization. A path-only grant
   does not authorize this step.

## Explicit runtime command

Only after those prerequisites and authorization, on the authorized Mac:

```bash
python3 tools/native_qa_webkit.py "$qa" \
  "$qa/target/debug/bundle/macos/OpenConductor QA.app" \
  --execute-runtime-probe
```

The verifier refuses a normal/old bundle before execution. It requires a prior
path receipt describing the same binary, configuration, identifier, executable
and prepared source. It starts only the QA probe in a separate process group,
with the isolated environment from `native_qa.environment`, a bounded timeout
and cleanup targeting that process group. It does not terminate preserved app
processes or global WebKit services.

The returned paths must still be confined to the QA root. The verifier rejects
persistent or unobserved datastores, visible or unobserved windows, non-blank
bootstrap URLs, missing control-policy flags, and ordinary database/settings
creation. A successful run writes a private `webkit-receipt.json` containing
binary/configuration hashes and the observation's explicit limitations. Never
reuse a completed runtime fixture or promote it to a blanket safe-GUI claim.

The control-policy fields record the installed/requested probe policy; only the
native datastore persistence and window visibility fields are runtime
observations. Retain this distinction in every report.

## Cloud-only validation

```bash
python3 -W error::ResourceWarning -m unittest \
  tools/test_native_qa.py tools/test_native_qa_webkit.py -v
```

These tests execute small fixture programs, not macOS apps or WebKit. They cover
prerequisite matching, fail-closed receipt validation, ordinary-store refusal,
credential filtering and bounded process termination. Native execution remains
not run until the separate exact-build runtime receipt exists.
