// In-app driver for real agent turns (Claude Code or Codex) under each auth
// mode of its Settings › Agents tab, evaluated in OpenConductor's main window
// by the debug-only seam in src-tauri/src/e2e.rs. Run by
// tools/auth/run-auth-modes-mac.sh, which starts the app with a throwaway
// HOME that already holds the agent's own login.
//
// Config (set by the runner before this file):
//   window.__OC_E2E__ = { agent: { id, tab, picker }, repo, repoName,
//                         modes: [{ id, card?, secret?, prompt, expect }] }
// A mode without `card` touches no setting (the import path). With `secret`
// ({ name, label }), the mode types the key `e2e_secret(name)` returns into
// the field labelled `label` and saves it, as a user pastes a key; the value
// is never reported. Each mode reads the tab (selected card, status, whether
// a sign-in is offered), then sends `prompt` in a new chat on the agent and
// records the turn's status and reply. Reports `<agent.id>-auth-modes`.
(async () => {
  if (window.__OC_E2E_RUNNING__) return;
  window.__OC_E2E_RUNNING__ = true;
  const cfg = window.__OC_E2E__;
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const steps = [];
  const sleep = (ms) =>
    new Promise((r) => {
      const obs = new MutationObserver(() => done());
      const timer = setTimeout(() => done(), ms);
      function done() {
        obs.disconnect();
        clearTimeout(timer);
        r();
      }
      obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    });
  const step = (name, extra = {}) => {
    steps.push({ at: new Date().toISOString(), step: name, ...extra });
    invoke("e2e_report", { name: `${cfg.agent.id}-auth-modes-progress`, data: { steps } }).catch(() => {});
  };
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const text = (el) => (el ? el.textContent.trim() : null);
  async function waitFor(what, fn, ms = 30000) {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(200);
    }
  }
  function setValue(el, value) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const TAB = `section[aria-label="${cfg.agent.tab}"]`;
  // The tab's status has answered: no Refresh still running, and a verdict shown.
  const STATUS = /Connected|not authenticated|Not signed in|No (Anthropic|OpenAI) API key/;
  const statusText = () => {
    const s = q(`${TAB} [data-testid="agent-auth-status"]`);
    const chatgpt = q(`${TAB} [data-testid="codex-chatgpt-connected"]`);
    return [s && !s.querySelector("button:disabled") ? s.innerText : "", chatgpt ? chatgpt.innerText : ""].join("\n");
  };
  async function readTab(mode) {
    window.dispatchEvent(new CustomEvent("openconductor:open-settings", { detail: { page: "providers", providerTab: cfg.agent.id } }));
    await waitFor(`the ${cfg.agent.tab} tab`, () => q(`${TAB} button[aria-pressed]`));
    if (mode.card) {
      const b = qa(`${TAB} button[aria-pressed]`).find((x) => x.textContent.startsWith(mode.card));
      if (!b) throw new Error(`no ${mode.card} card`);
      b.click();
      await waitFor(`${mode.card} selected`, () => (qa(`${TAB} button[aria-pressed="true"]`).map(text)[0] ?? "").startsWith(mode.card));
    }
    await waitFor("the status line", () => STATUS.test(statusText()), 20000);
    if (mode.secret) {
      // Typed once the status has settled: a refresh still out would overwrite a just-saved key (#646).
      const input = await waitFor(`the ${mode.secret.label} field`, () => q(`${TAB} input[aria-label="${mode.secret.label}"]`));
      setValue(input, await invoke("e2e_secret", { name: mode.secret.name }));
      const save = await waitFor("Save", () => qa(`${TAB} button`).find((x) => text(x) === "Save" && !x.disabled));
      save.click();
      await waitFor("the saved key", () => q(`${TAB} [data-testid="secret-value"]`));
      await waitFor("Connected", () => /Connected/.test(statusText()), 30000);
    }
    const status = statusText();
    const tabText = q(TAB).innerText;
    // Both places a card is stored: `<agent>_provider` and `[providers.<agent>]`.
    const stored = await invoke("get_settings").then((s) => ({
      provider: s[`${cfg.agent.id}_provider`] ?? null,
      config: s.providers?.[cfg.agent.id] ?? null,
    }));
    const info = {
      card: (qa(`${TAB} button[aria-pressed="true"]`).map(text)[0] ?? "").replace(/Recommended$/, "") || null,
      connected: /Connected/.test(status) && !/not authenticated|Not signed in/i.test(status),
      // Only whether an account is shown; the address itself stays out of the evidence.
      showsAccount: /@/.test(tabText),
      loginMethod: (tabText.match(/Login method\s*([^\n]+)/) || [])[1]?.trim() ?? null,
      version: (tabText.match(/Version\s*([^\n]+)/) || [])[1]?.trim() ?? null,
      loginPrompt: /claude \/login|codex login|Sign in with ChatGPT/.test(tabText),
      // The key's last characters as the tab masks it, never the key.
      keyShown: mode.secret ? !!q(`${TAB} [data-testid="secret-value"]`) : null,
      stored,
    };
    q(".settings-back")?.click();
    await waitFor("the workspace", () => q(".workspace .composer [contenteditable=true]"));
    return info;
  }

  async function newAgentChat(first) {
    if (!first) {
      q(".main-tab-new-button").click();
      await waitFor("a new chat", () => q(".workspace .composer [contenteditable=true]") && !q(".chat-turn-end"));
    }
    const chip = await waitFor("the model picker", () => q("[data-testid='composer-model-button']"));
    chip.click();
    const entry = await waitFor(`${cfg.agent.picker} in the model picker`, () => qa(".oc-model-menu .oc-model-item").find((b) => text(b) === cfg.agent.picker));
    entry.click();
    await waitFor(`${cfg.agent.picker} on the chip`, () => {
      const c = q("[data-testid='composer-model-button']");
      return c && (c.title === cfg.agent.picker || text(c).includes(cfg.agent.picker));
    });
  }

  async function sendTurn(prompt) {
    const endsBefore = qa(".chat-turn-end").length;
    // The composer is a contenteditable editor: a normal insertText edit, as
    // tools/e2e/transcript-parity.e2e.mjs types into it.
    const box = q(".composer [contenteditable=true]");
    box.focus();
    getSelection().selectAllChildren(box);
    document.execCommand("insertText", false, prompt);
    await waitFor("the composer to hold the prompt", () => q(".composer [contenteditable=true]").textContent === prompt);
    await waitFor("Send enabled", () => !q('.composer button[type="submit"]').disabled);
    const sentAt = Date.now();
    q('.composer button[type="submit"]').click();
    await waitFor("the turn to end", () => qa(".chat-turn-end").length > endsBefore, 300000);
    const end = qa(".chat-turn-end")[endsBefore];
    const replies = qa(".chat-assistant .chat-text").map((t) => t.textContent);
    return {
      status: (end.className.match(/status-(\w+)/) || [])[1] ?? null,
      error: text(end.querySelector(".chat-turn-error")),
      signInNotice: text(q('[data-testid="chat-sign-in"]')),
      reply: replies.at(-1) ?? null,
      seconds: Math.round((Date.now() - sentAt) / 1000),
    };
  }

  const report = { flow: `${cfg.agent.id}-auth-modes`, agent: cfg.agent.id, started: new Date().toISOString(), result: "fail", steps, modes: [] };
  try {
    // A fresh HOME starts on the first-run onboarding: Continue, as a user does.
    await waitFor("the app or the onboarding", () => q(".home-card") || q(".workspace") || q(".onb-continue"), 60000);
    if (q(".onb-continue")) {
      q(".onb-continue").click();
      step("onboarding: Continue");
    }
    await waitFor("the app", () => q(".home-card") || q(".workspace"));
    if (!qa(".sb-repo-name").map(text).includes(cfg.repoName)) {
      window.__OC_E2E_PICK_FOLDER__ = cfg.repo;
      const open = await waitFor("Open project on Home", () => qa(".home-card").find((c) => text(c.querySelector(".home-card-label")) === "Open project"));
      open.click();
      await waitFor(`${cfg.repoName} in the sidebar`, () => qa(".sb-repo-name").map(text).includes(cfg.repoName));
    }
    (await waitFor("Create workspace button", () => q(`.sb-repo-add[aria-label="Create workspace in ${cfg.repoName}"]`))).click();
    (await waitFor("the Create workspace dialog", () => q('form.create-ws button[type="submit"]'))).click();
    await waitFor("the workspace view", () => q(".workspace .composer [contenteditable=true]"), 60000);
    step("workspace created");

    for (const [i, mode] of cfg.modes.entries()) {
      const tab = await readTab(mode);
      step(`${mode.id}: ${cfg.agent.tab} tab read`, tab);
      await newAgentChat(i === 0);
      let turn;
      try {
        turn = await sendTurn(mode.prompt);
      } catch (e) {
        // One mode timing out still lets the next mode run.
        turn = { status: "timeout", error: String(e && e.message ? e.message : e), reply: null, seconds: null };
      }
      step(`${mode.id}: turn ended`, turn);
      const ok = turn.status === "completed" && !turn.signInNotice && (turn.reply ?? "").includes(mode.expect);
      report.modes.push({ id: mode.id, card: mode.card ?? null, secret: mode.secret?.name ?? null, prompt: mode.prompt, tab, turn, ok });
    }
    for (const m of report.modes) m.pass = m.ok && m.tab.connected && !m.tab.loginPrompt;
    report.result = report.modes.every((m) => m.pass) ? "pass" : "fail";
  } catch (e) {
    report.error = `${e && e.message ? e.message : e}\n${e && e.stack ? e.stack : ""}`;
    report.screenText = (document.body?.innerText ?? "").slice(0, 1500);
  }
  report.ended = new Date().toISOString();
  await invoke("e2e_report", { name: `${cfg.agent.id}-auth-modes`, data: report });
})();
