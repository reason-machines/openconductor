# Fake Reason browser pairing

## Run the checks

The tests need Node 22, Cargo, Python 3, the installed npm dependencies, and Chromium. They do not need Tauri system libraries or a real Reason installation.

```bash
node --test tools/reason-pairing/server.test.mjs
REASON_PAIRING_EVIDENCE=e2e-artifacts/reason-pairing \
  node --test tests/e2e/reason-pairing.e2e.mjs
```

Set `CHROME_PATH` if Chromium is not in a standard location. `TEST_BASE_URL` can reuse an existing Vite server. Otherwise the test starts Vite on an ephemeral loopback port and closes it afterward. The dedicated `reason-pairing.yml` CI workflow installs its own browser and uploads screenshots.

## What runs

`rust-bridge.mjs` generates a temporary Rust executable that imports the production `cli.rs`, `account.rs`, and `login.rs`. Fixture IPC calls its real `LoginService` and `LaunchConfig`. Rust launches the absolute path of `fake-reason.py`; it never resolves or launches an installed Reason CLI. The temporary bridge alone enables `LoginOptions.allow_loopback` and short test deadlines.

Chromium renders the production `ReasonSignInControls` settings and chat variants and the production onboarding `SignUp`. The fixture substitutes only Tauri IPC transport and the browser opener. The emitted URL opens as a real second Chromium page. That page posts an explicit fixture account and workspace choice to the fake HTTP server.

The fake executable starts a detached finisher that polls this server. It completes only after explicit browser approval. Status reads never approve a pending request or materialize credentials. The server protocol is deliberately test-only, not a copy of Reason's production OAuth endpoints.

The finisher shape follows the inspected [CLI source at monorepo 6677412104358d1becb9fd3c9d2312142dcd258e](https://github.com/reason-machines/monorepo/tree/6677412104358d1becb9fd3c9d2312142dcd258e/cli). `device-oauth.ts` lines 569–596 define `startSignInFinisher`, spawn the same CLI detached with no terminal, and call `unref`. The function's documented job is to wait for browser approval and finish what rerunning the command would do. This contract was inspected before changing the fake to use it.

The server owns each request's `pending`, `approved`, `cancelled`, or `expired` state. A pending poll cannot approve it. The old onboarding fixture resolves an in-memory account directly; the old ACP fixture completes pending login on a status read. Those shortcuts remain separate and are not used here.

## Covered behavior

- Browser URL handoff, matching confirmation code, and no account before approval.
- Explicit account and workspace choice, including a global CLI workspace hint.
- Settings, onboarding, and chat controls with StrictMode both on and off.
- One attempt and one automatic browser open across entry switches and control remounts.
- The actual onboarding `onSignedIn` callback fires once after approval.
- Local cancellation, stopped app polling, and ignored late browser approval.
- Retry while the same remote request remains pending, with a new local attempt ID and protection against stale cancellation.
- Canonical timeout followed by a usable retry.
- Existing login on initial mount without another pairing or browser open.
- External credential expiry observed after a fresh frontend mount.
- Approval racing cancellation preserves the saved CLI account without global logout.
- A delayed CLI response remains cancellable before a URL appears.
- Browser opener failure is visible, and explicit reopen preserves the attempt.

## Boundaries and limits

Everything binds to `127.0.0.1`. Fake identities use `example.invalid`. The server issues no tokens and rejects cookies and authorization headers. The fake executable refuses non-loopback origins and ignores proxy configuration. Browser request interception rejects every origin except the local Vite and pairing servers. Each case has a fresh browser context and fixture client. No real browser profile, account, approval, credentials, or inference is used.

Cancel stops the app's owned foreground process and polling. It does not revoke a remote request or stop a detached CLI finisher. A late browser approval may still sign the fake CLI in, just as the inspected production CLI can do. The tests require the cancelled app UI to remain cancelled until explicit retry and verify that the saved CLI account is not removed.

This is real Rust process-launch and lifecycle coverage with real React controls and an actual local browser approval page. It is not native Tauri IPC, a complete Settings or chat application screen, macOS WebKit, installed-CLI discovery, a real Reason sign-in, a Reason turn, or Conductor parity proof. The native evidence lane owns those separate checks.

## Viewed browser evidence

These screenshots came from the passing fake-server E2E before the saved-account refresh extension. They show synthetic identities only. The images were opened and inspected before publication.

![Fake-server E2E waiting for browser approval; not native or real Reason sign-in](https://api.reasonmachines.com/media/pr-screenshots/ed2069a5-6a2b-4607-b33a-548d6832a3fd/c2de8f73d65d6c75badffd907b7ebf38/settings-waiting-strict-true.png#w=1280&h=820)

![Fake-server E2E connected account and workspace; not native or real Reason sign-in](https://api.reasonmachines.com/media/pr-screenshots/ed2069a5-6a2b-4607-b33a-548d6832a3fd/546145c7f3330521f98f433915071c63/settings-connected-strict-true.png#w=1280&h=820)

![Fake browser approval page; no real credentials](https://api.reasonmachines.com/media/pr-screenshots/ed2069a5-6a2b-4607-b33a-548d6832a3fd/26f86f63a87e1321cf357c4cbff7e040/settings-waiting-strict-true-approval.png#w=1280&h=820)
