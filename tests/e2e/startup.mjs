const CONTINUE = ".onb .onb-continue:not(:disabled)";
const SETUP_STATE = `
return {
  setupError: document.querySelector('[data-testid="reason-cli-setup"] [role="alert"]')?.textContent?.trim() || null,
  setup: !!document.querySelector('[data-testid="reason-cli-setup"]'),
  onboarding: !!document.querySelector('.onb .onb-continue:not(:disabled)'),
  app: !!document.querySelector('.app'),
};`;

/** Wait for the real installer gate without pairing, retrying or skipping onboarding. */
export async function waitForSetup(client, { timeoutMs = 600000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await client.execute(SETUP_STATE, [], Math.max(1, deadline - Date.now()));
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (last?.setupError) throw new Error(`Reason CLI setup failed: ${last.setupError}`);
    if (!last?.setup && (last?.onboarding || last?.app)) return last;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(250, deadline - Date.now()))));
  }
  throw new Error(`timed out waiting for Reason CLI setup after ${timeoutMs} ms; last: ${JSON.stringify(last)}`);
}

/** Finish built-app startup; fixture hooks run only after official CLI setup succeeds. */
export async function finishStartup(client, { afterSetup, timeoutMs = 600000 } = {}) {
  const state = await waitForSetup(client, { timeoutMs });
  if (afterSetup) await afterSetup();
  if (state.onboarding) {
    const [button] = await client.findAll(CONTINUE);
    if (!button) throw new Error("onboarding Continue disappeared after Reason CLI setup");
    await client.click(button);
  }
  await client.waitForAppReady();
}
