// In-app driver for the composer's "/" menu with the real agents, evaluated
// in OpenConductor's main window by the debug-only seam in src-tauri/src/e2e.rs
// (macOS has no tauri-driver). For each agent it opens the menu, filters it,
// picks a skill with Enter and sends it as a real turn, then reports with the
// `e2e_report` command. It also saves the window's DOM and CSS with the menu
// open (`slash-dom-<agent>-<state>.json`): a locked screen allows no
// screenshot, so the window is rendered from those elsewhere
// (tools/slash-menu/render.mjs).
//
// Config (set by tools/slash-menu/run-e2e-mac.sh before this file):
//   window.__OC_E2E__ = { repo, repoName, agents: [{ id, label, filter, skill, args, expect }] }
(async () => {
  // src-tauri/src/e2e.rs evaluates this until it reports; run once.
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
    invoke("e2e_report", { name: "slash-menu-progress", data: { steps } }).catch(() => {});
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
    el.setSelectionRange(value.length, value.length);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // A hidden window may not take focus; React's onFocus listens to focusin.
  function focusBox(box) {
    box.focus();
    box.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  }
  const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: k, bubbles: true, cancelable: true }));
  const menuRows = () =>
    qa(".oc-suggest .oc-suggest-row").map((r) => ({ name: text(r.querySelector(".oc-suggest-name")), description: text(r.querySelector(".oc-suggest-desc")), skill: r.hasAttribute("data-skill") }));
  const headings = () => qa(".oc-suggest .oc-suggest-heading-label").map(text);
  async function saveDom(name) {
    const dom = {
      html: document.documentElement.outerHTML,
      css: Array.from(document.styleSheets).map((s) => {
        try {
          return Array.from(s.cssRules, (r) => r.cssText).join("\n");
        } catch {
          return "";
        }
      }),
      viewport: { width: innerWidth, height: innerHeight },
      theme: document.documentElement.className,
    };
    await invoke("e2e_report", { name, data: dom });
  }
  async function pickAgent(a) {
    const chip = await waitFor("the model picker", () => q("[data-testid='composer-model-button']"));
    if (a.label && text(chip).includes(a.label)) return;
    chip.click();
    const items = await waitFor("the model menu", () => {
      const xs = qa(".oc-model-menu .oc-model-item");
      return xs.length ? xs : null;
    });
    const entry = a.label ? items.find((b) => text(b) === a.label) : items.find((b) => !["Claude Code", "Codex"].includes(text(b)));
    if (!entry) throw new Error(`no ${a.label ?? "Reason model"} in the model picker: ${items.map(text).join(", ")}`);
    entry.click();
    await waitFor(`${a.id} on the chip`, () => (a.label ? text(q("[data-testid='composer-model-button']")).includes(a.label) : !["Claude Code", "Codex"].some((l) => text(q("[data-testid='composer-model-button']")).includes(l))));
  }
  // The visible chat's text: the agent switch shows that agent's own transcript.
  const chatText = () => q(".chat-scroll")?.innerText ?? "";
  function lastAssistantText() {
    const last = qa(".chat-scroll .chat-assistant").at(-1);
    return last ? last.innerText : null;
  }
  function lastTools() {
    for (const b of qa('.chat-tool-summary-row[aria-expanded="false"]')) b.click();
    const last = qa(".chat-scroll .chat-assistant").at(-1);
    return last ? Array.from(last.querySelectorAll(".chat-tool"), (t) => t.innerText.slice(0, 300)) : [];
  }
  const errorText = (e) => `${e && e.message ? e.message : e}\n${e && e.stack ? e.stack : ""}`;

  const report = { flow: "slash-menu", started: new Date().toISOString(), result: "fail", steps, agents: [] };
  step("driver started", { href: location.href, readyState: document.readyState });
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
    step("workspace created", { name: text(q(".ws-title strong")) });

    for (const a of cfg.agents) {
      const out = { id: a.id };
      report.agents.push(out);
      try {
        await pickAgent(a);
        step(`${a.id}: agent picked`, { chip: text(q("[data-testid='composer-model-button']")) });
        const box = q(".composer textarea");
        focusBox(box);
        setValue(box, "/");
        const t0 = Date.now();
        // Built-ins show at once; the agent's own list arrives from its CLI.
        await waitFor(`${a.id}'s commands and skills in the menu`, () => menuRows().some((r) => r.name === a.skill || r.name === a.skillLabel), 60000);
        await sleep(300);
        out.menu = { ms: Date.now() - t0, rows: menuRows(), headings: headings() };
        out.menu.count = out.menu.rows.length;
        out.menu.skills = out.menu.rows.filter((r) => r.skill).length;
        step(`${a.id}: menu open`, { count: out.menu.count, skills: out.menu.skills, ms: out.menu.ms });
        await saveDom(`slash-dom-${a.id}-open`);

        setValue(box, `/${a.filter}`);
        await sleep(400);
        out.filtered = { query: a.filter, rows: menuRows(), headings: headings() };
        step(`${a.id}: filtered`, { query: a.filter, rows: out.filtered.rows.map((r) => r.name) });
        await saveDom(`slash-dom-${a.id}-filtered`);

        // Pick the skill: move the highlight to it, then Enter.
        const idx = out.filtered.rows.findIndex((r) => r.name === (a.skillLabel ?? a.skill));
        if (idx < 0) throw new Error(`${a.skill} is not in the filtered menu`);
        for (let i = 0; i < idx; i++) key(box, "ArrowDown");
        await sleep(100);
        key(box, "Enter");
        await sleep(200);
        out.inserted = box.value;
        step(`${a.id}: picked`, { draft: out.inserted });
        setValue(box, `${box.value}${a.args}`);
        const ends = qa(".chat-turn-end").length;
        await waitFor("Send enabled", () => !q('.composer button[type="submit"]').disabled);
        out.sent = box.value;
        q('.composer button[type="submit"]').click();
        step(`${a.id}: sent`, { text: out.sent });
        await waitFor(`${a.id}'s turn to end`, () => qa(".chat-turn-end").length > ends, a.timeoutMs ?? 300000);
        const end = qa(".chat-turn-end").at(-1);
        await sleep(800);
        await sleep(400);
        out.turn = { status: (end.className.match(/status-(\w+)/) || [])[1] ?? null, error: text(end.querySelector(".chat-turn-error")), reply: lastAssistantText(), tools: lastTools(), user: text(qa(".chat-scroll .chat-user .chat-bubble").at(-1)), chat: chatText().slice(-4000) };
        out.ran = out.turn.status === "completed" && (!a.expect || (out.turn.reply ?? "").includes(a.expect));
        step(`${a.id}: turn ended`, { status: out.turn.status, ran: out.ran });
      } catch (e) {
        out.error = errorText(e);
        step(`${a.id}: failed`, { error: out.error, chip: text(q("[data-testid='composer-model-button']")), picker: qa(".oc-model-menu .oc-model-item").map(text) });
      }
    }
    report.result = report.agents.every((a) => a.ran) ? "pass" : "fail";
  } catch (e) {
    report.error = errorText(e);
  }
  report.ended = new Date().toISOString();
  await invoke("e2e_report", { name: "slash-menu", data: report });
})();
