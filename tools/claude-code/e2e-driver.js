// In-app driver for the Claude Code chat flow, evaluated in OpenConductor's
// main window by the debug-only seam in src-tauri/src/e2e.rs (macOS has no
// tauri-driver, and a locked screen rules out UI automation). It drives the
// real UI the way a user does and reports with the `e2e_report` command.
//
// Config (set by tools/claude-code/run-e2e-mac.sh before this file):
//   window.__OC_E2E__ = { repo, repoName, turns: [{ text, stopOnTool?, timeoutMs? }] }
(async () => {
  const cfg = window.__OC_E2E__;
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const started = new Date().toISOString();
  const steps = [];
  // A hidden window (locked screen) may throttle or suspend timers, so every
  // wait also wakes on the next DOM change.
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
  // Each step is also written right away, so a stuck run shows where it stopped.
  const step = (name, extra = {}) => {
    steps.push({ at: new Date().toISOString(), step: name, ...extra });
    invoke("e2e_report", { name: "claude-turn-progress", data: { steps } }).catch(() => {});
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

  // React tracks input values itself: set through the native setter, then
  // dispatch the event React listens to.
  function setValue(el, value) {
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  }

  function transcript() {
    return qa(".transcript > *").map((el) => {
      const row = { class: el.className };
      if (el.matches(".chat-user")) row.user = text(el.querySelector(".chat-bubble"));
      if (el.matches(".chat-assistant")) {
        row.text = Array.from(el.querySelectorAll(".chat-text"), (t) => t.textContent);
        row.tools = Array.from(el.querySelectorAll(".chat-tool"), (t) => ({
          status: (t.className.match(/status-(\w+)/) || [])[1] ?? null,
          name: text(t.querySelector(".chat-tool-name")),
          summary: text(t.querySelector(".chat-tool-summary")),
          result: text(t.querySelector(".chat-tool-result")),
        }));
      }
      if (el.matches(".chat-turn-footer")) {
        const end = el.querySelector(".chat-turn-end");
        row.turnId = end?.dataset.turnId ?? null;
        row.status = (end?.className.match(/status-(\w+)/) || [])[1] ?? null;
        row.error = text(end?.querySelector(".chat-turn-error"));
        row.interrupted = text(end?.querySelector(".chat-badge")) === "Interrupted by user";
        // The turn's checkpoints: the files it changed, as chips under the turn.
        row.changes = Array.from(el.querySelectorAll(".chat-turn-chip:not(.more)"), (c) => ({ file: text(c.querySelector(".name")), counts: text(c.querySelector(".count")) }));
      }
      return row;
    });
  }

  const report = { flow: "claude-turn", started, result: "fail", steps, turns: [] };
  try {
    await waitFor("the app", () => q(".home-card") || q(".workspace"));
    step("app loaded", { home: !!q(".home-card") });

    if (!qa(".sb-repo-name").map(text).includes(cfg.repoName)) {
      window.__OC_E2E_PICK_FOLDER__ = cfg.repo;
      const open = await waitFor("Open project on Home", () => qa(".home-card").find((c) => text(c.querySelector(".home-card-label")) === "Open project"));
      open.click();
      await waitFor(`${cfg.repoName} in the sidebar`, () => qa(".sb-repo-name").map(text).includes(cfg.repoName));
    }
    step("repo added", { repo: cfg.repo });

    const add = await waitFor("Create workspace button", () => q(`.sb-repo-add[aria-label="Create workspace in ${cfg.repoName}"]`));
    add.click();
    const submit = await waitFor("the Create workspace dialog", () => q('form.create-ws button[type="submit"]'));
    submit.click();
    await waitFor("the workspace view", () => q(".workspace .composer textarea"), 60000);
    report.workspace = { name: text(q(".ws-title strong")), branch: text(q(".ws-title .chip")) };
    step("workspace created", report.workspace);

    // The agent is picked in the composer's model picker, as in Conductor: "Claude Code" is listed after the models.
    const chip = await waitFor("the model picker", () => q("[data-testid='composer-model-button']"));
    chip.click();
    const entry = await waitFor("Claude Code in the model picker", () => qa(".oc-model-menu .oc-model-item").find((b) => text(b) === "Claude Code"));
    entry.click();
    await waitFor("Claude Code on the picker chip", () => text(q("[data-testid='composer-model-button']")).includes("Claude Code"));
    report.agentLabel = "Claude Code";
    report.emptyState = text(q(".chat .oc-chat-empty"));
    step("agent picked", { agent: "claude", label: report.agentLabel });

    for (const [i, turn] of cfg.turns.entries()) {
      const endsBefore = qa(".chat-turn-end").length;
      const box = q(".composer textarea");
      setValue(box, turn.text);
      await waitFor("Send enabled", () => !q('.composer button[type="submit"]').disabled);
      const sentAt = new Date().toISOString();
      q('.composer button[type="submit"]').click();
      step(`turn ${i + 1} sent`, { text: turn.text });
      let stop = null;
      if (turn.stopOnTool) {
        const ended = () => qa(".chat-turn-end").length > endsBefore;
        const running = await waitFor("a running tool row", () => q(".chat-tool.status-running") || (ended() && { error: "the turn ended before a tool ran" }), turn.timeoutMs ?? 120000).catch((e) => ({ error: String(e) }));
        if (running.error) {
          stop = { pressed: false, reason: running.error };
        } else {
          await sleep(1500);
          const button = q('.composer button[title="Stop the agent"]');
          stop = { pressed: !!button, at: new Date().toISOString(), tool: text(running.querySelector(".chat-tool-name")), summary: text(running.querySelector(".chat-tool-summary")) };
          button?.click();
          step(`turn ${i + 1} Stop pressed`, stop);
        }
      }
      await waitFor(`turn ${i + 1} to end`, () => qa(".chat-turn-end").length > endsBefore, turn.timeoutMs ?? 300000);
      const end = qa(".chat-turn-end")[endsBefore];
      const status = (end.className.match(/status-(\w+)/) || [])[1] ?? null;
      report.turns.push({ n: i + 1, prompt: turn.text, sentAt, endedAt: new Date().toISOString(), status, error: text(end.querySelector(".chat-turn-error")), stop });
      step(`turn ${i + 1} ended`, { status });
      await sleep(500);
    }
    // The checkpoint diff behind the chips comes after the turn ends.
    await sleep(2000);
    // Finished turns collapse their tool calls; open them so the record has every row.
    for (const b of qa('.chat-tool-summary-row[aria-expanded="false"]')) b.click();
    await sleep(300);
    report.transcript = transcript();
    report.savedSessions = Object.keys(localStorage)
      .filter((k) => k.startsWith("openconductor.claude.session."))
      .map((k) => ({ key: k, sessionId: localStorage.getItem(k) }));
    report.result = report.turns.every((t) => t.status === (cfg.turns[t.n - 1].expect ?? "completed")) ? "pass" : "fail";
  } catch (e) {
    report.error = String(e && e.stack ? e.stack : e);
    report.transcript = transcript();
  }
  report.ended = new Date().toISOString();
  // DOM and stylesheets, so the window can be rendered elsewhere: the locked
  // screen allows no screenshot of the real window.
  report.dom = {
    html: document.documentElement.outerHTML,
    css: Array.from(document.styleSheets).map((s) => {
      try {
        return Array.from(s.cssRules, (r) => r.cssText).join("\n");
      } catch {
        return "";
      }
    }),
    viewport: { width: innerWidth, height: innerHeight },
  };
  await invoke("e2e_report", { name: "claude-turn", data: report });
})();
