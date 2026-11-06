// In-app driver for real Claude Code turns under Settings › Agents › Claude
// Code's auth modes, evaluated in OpenConductor's main window by the
// debug-only seam in src-tauri/src/e2e.rs. Run by
// tools/claude-code/run-auth-modes-mac.sh, which starts the app with a
// throwaway HOME that already holds a Claude Code login.
//
// Config (set by the runner before this file):
//   window.__OC_E2E__ = { repo, repoName, modes: [{ id, card?, prompt, expect }] }
// A mode without `card` touches no setting (the import path). Each mode reads
// the Claude Code tab (selected card, status, whether "claude /login" is
// offered), then sends `prompt` in a new chat on Claude Code and records the
// turn's status and reply. Reports `claude-auth-modes`.
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
    invoke("e2e_report", { name: "claude-auth-modes-progress", data: { steps } }).catch(() => {});
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
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const TAB = 'section[aria-label="Claude Code"]';
  async function readTab(card) {
    window.dispatchEvent(new CustomEvent("openconductor:open-settings", { detail: { page: "providers", providerTab: "claude" } }));
    await waitFor("the Claude Code tab", () => q(`${TAB} button[aria-pressed]`));
    if (card) {
      const b = qa(`${TAB} button[aria-pressed]`).find((x) => x.textContent === card);
      if (!b) throw new Error(`no ${card} card`);
      b.click();
      await waitFor(`${card} selected`, () => qa(`${TAB} button[aria-pressed="true"]`).map(text)[0] === card);
    }
    // The status line has answered once Refresh is enabled again.
    await waitFor("the status line", () => {
      const s = q(`${TAB} [data-testid="agent-auth-status"]`);
      return s && !s.querySelector("button:disabled") && /Connected|not authenticated|No Anthropic/.test(s.innerText);
    }, 20000);
    const status = q(`${TAB} [data-testid="agent-auth-status"]`).innerText;
    const tabText = q(TAB).innerText;
    const stored = await invoke("get_settings").then((s) => s.providers?.claude ?? null);
    const info = {
      card: qa(`${TAB} button[aria-pressed="true"]`).map(text)[0] ?? null,
      connected: /Connected/.test(status) && !/not authenticated/i.test(status),
      // Only whether an email and a login method are shown; the address itself stays out of the evidence.
      showsEmail: /Email/.test(tabText) && /@/.test(tabText),
      loginMethod: (tabText.match(/Login method\s*([^\n]+)/) || [])[1]?.trim() ?? null,
      version: (tabText.match(/Version\s*([^\n]+)/) || [])[1]?.trim() ?? null,
      loginPrompt: tabText.includes("claude /login"),
      stored,
    };
    q(".settings-back")?.click();
    await waitFor("the workspace", () => q(".workspace .composer textarea"));
    return info;
  }

  async function newClaudeChat(first) {
    if (!first) {
      q(".main-tab-new-button").click();
      await waitFor("a new chat", () => q(".workspace .composer textarea") && !q(".chat-turn-end"));
    }
    const chip = await waitFor("the model picker", () => q("[data-testid='composer-model-button']"));
    chip.click();
    const entry = await waitFor("Claude Code in the model picker", () => qa(".oc-model-menu .oc-model-item").find((b) => text(b) === "Claude Code"));
    entry.click();
    await waitFor("Claude Code on the chip", () => text(q("[data-testid='composer-model-button']")).includes("Claude Code"));
  }

  async function sendTurn(prompt) {
    const endsBefore = qa(".chat-turn-end").length;
    setValue(q(".composer textarea"), prompt);
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

  const report = { flow: "claude-auth-modes", started: new Date().toISOString(), result: "fail", steps, modes: [] };
  try {
    await waitFor("the app", () => q(".home-card") || q(".workspace"));
    if (!qa(".sb-repo-name").map(text).includes(cfg.repoName)) {
      window.__OC_E2E_PICK_FOLDER__ = cfg.repo;
      const open = await waitFor("Open project on Home", () => qa(".home-card").find((c) => text(c.querySelector(".home-card-label")) === "Open project"));
      open.click();
      await waitFor(`${cfg.repoName} in the sidebar`, () => qa(".sb-repo-name").map(text).includes(cfg.repoName));
    }
    (await waitFor("Create workspace button", () => q(`.sb-repo-add[aria-label="Create workspace in ${cfg.repoName}"]`))).click();
    (await waitFor("the Create workspace dialog", () => q('form.create-ws button[type="submit"]'))).click();
    await waitFor("the workspace view", () => q(".workspace .composer textarea"), 60000);
    step("workspace created");

    for (const [i, mode] of cfg.modes.entries()) {
      const tab = await readTab(mode.card);
      step(`${mode.id}: Claude Code tab read`, tab);
      await newClaudeChat(i === 0);
      const turn = await sendTurn(mode.prompt);
      step(`${mode.id}: turn ended`, turn);
      const ok = turn.status === "completed" && !turn.signInNotice && (turn.reply ?? "").includes(mode.expect);
      report.modes.push({ id: mode.id, card: mode.card ?? null, prompt: mode.prompt, tab, turn, ok });
    }
    report.result = report.modes.every((m) => m.ok && m.tab.connected && !m.tab.loginPrompt) ? "pass" : "fail";
  } catch (e) {
    report.error = String(e && e.stack ? e.stack : e);
  }
  report.ended = new Date().toISOString();
  await invoke("e2e_report", { name: "claude-auth-modes", data: report });
})();
