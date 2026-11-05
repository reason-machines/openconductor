// IPC fixtures per scenario: command name -> value or (args, ctx) => value.
// Everything is invented for the harness; tokens are obviously fake strings.
(function () {
  const FAKE_TOKEN = "oc-harness-fake-token";
  const USER = {
    id: "user_demo_0001",
    name: "Ada Demo",
    email: "ada@example.com",
    avatarUrl: "",
    createdAt: "2026-01-15T09:00:00.000Z",
    githubInstallations: [],
    githubUsername: "ada-demo",
  };
  const KEYCHAIN_SIGNED_IN = {
    conductor_api_token: FAKE_TOKEN,
    cached_user_data: JSON.stringify({ apiToken: FAKE_TOKEN, userData: USER }),
  };
  window.__OC_FAKE__ = { FAKE_TOKEN, USER, KEYCHAIN_SIGNED_IN };

  window.__OC_FIXTURES__ = function (scenario) {
    const signedIn = scenario !== "signed-out";
    const keychain = signedIn ? KEYCHAIN_SIGNED_IN : {};
    return {
      get_keychain_setting: (args) => keychain[args.key] ?? null,
      set_keychain_setting: (args) => {
        keychain[args.key] = args.value;
        return null;
      },
      delete_keychain_setting: (args) => {
        delete keychain[args.key];
        return null;
      },
      native_http_fetch: () => {
        throw "network disabled in the screenshot harness";
      },
    };
  };
})();
