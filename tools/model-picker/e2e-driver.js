// In-app driver for the composer's model chip and picker on a Reason chat, run
// in the built OpenConductor window by the debug-only seam (src-tauri/src/e2e.rs)
// with the user's signed-in `reason` CLI. It creates a workspace, then records
// the chip and the picker's rows before the first turn, after a short real turn,
// and (when the picker lists it) after picking another of Reason's models and
// running one more turn. At each point it saves the window's DOM and CSS
// (`model-dom-<step>.json`, rendered by tools/slash-menu/render.mjs, since a
// locked screen allows no screenshot) and reports `model-picker.json`.
//
// Config (set by tools/model-picker/run-e2e-mac.sh before this file):
//   window.__OC_E2E__ = { repo, repoName, prompt, pick }
(async () => {
  if (window.__OC_E2E_RUNNING__) return;
  window.__OC_E2E_RUNNING__ = true;
  const cfg = window.__OC_E2E__;
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const steps = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = (name, extra = {}) => {
    steps.push({ at: new Date().toISOString(), step: name, ...extra });
    invoke("e2e_report", { name: "model-picker-progress", data: { steps } }).catch(() => {});
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
    Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
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
    await invoke("e2e_report", { name: `model-dom-${name}`, data: dom });
  }
  const chip = () => q("[data-testid='composer-model-button']");
  const chipState = () => ({ text: text(chip()), aria: chip()?.getAttribute("aria-label") ?? null });
  const rows = () => qa(".oc-model-menu .oc-model-item:not(.oc-model-add)").map((b) => ({ name: text(b.querySelector(".oc-model-item-name")), detail: text(b.querySelector(".oc-model-item-effort")), selected: b.hasAttribute("data-selected") }));
  async function openMenu() {
    if (!q(".oc-model-menu")) chip().click();
    await waitFor("the model menu", () => q(".oc-model-menu"));
    await sleep(300);
  }
  async function closeMenu() {
    if (q(".oc-model-menu")) chip().click();
    await sleep(200);
  }
  // Records the chip, then the open menu, as `<name>` and `<name>-menu`.
  async function snapshot(name) {
    await closeMenu();
    const out = { chip: chipState() };
    await saveDom(name);
    await openMenu();
    out.rows = rows();
    out.count = out.rows.length;
    await saveDom(`${name}-menu`);
    await closeMenu();
    step(name, { chip: out.chip.text, rows: out.count, first: out.rows.slice(0, 6).map((r) => r.name) });
    return out;
  }
  async function turn(prompt) {
    const box = q(".composer textarea");
    box.focus();
    setValue(box, prompt);
    const ends = qa(".chat-turn-end").length;
    await waitFor("Send enabled", () => !q('.composer button[type="submit"]').disabled);
    q('.composer button[type="submit"]').click();
    await waitFor("the turn to end", () => qa(".chat-turn-end").length > ends, 300000);
    const end = qa(".chat-turn-end").at(-1);
    // The backend asks `reason session get` for the model after the turn ends.
    await waitFor("the chip to settle", async () => {
      const before = text(chip());
      await sleep(4000);
      return text(chip()) === before;
    }, 60000);
    return { status: (end.className.match(/status-(\w+)/) || [])[1] ?? null, error: text(end.querySelector(".chat-turn-error")), reply: (qa(".chat-scroll .chat-assistant").at(-1)?.innerText ?? "").slice(0, 400) };
  }

  const report = { flow: "model-picker", started: new Date().toISOString(), result: "fail", steps };
  try {
    await waitFor("the app", () => q(".home-card") || q(".workspace"));
    // The app reopens the last selection; Open project is on Home. A
    // workspace still loading can swallow the first click, so retry it.
    await waitFor("Home", () => {
      if (q(".home-card")) return true;
      qa("button.sb-row").find((b) => text(b.querySelector(".sb-row-label")) === "Home")?.click();
      return false;
    }, 60000);
    if (!qa(".sb-repo-name").map(text).includes(cfg.repoName)) {
      window.__OC_E2E_PICK_FOLDER__ = cfg.repo;
      const open = await waitFor("Open project on Home", () => qa(".home-card").find((c) => text(c.querySelector(".home-card-label")) === "Open project"));
      open.click();
      await waitFor(`${cfg.repoName} in the sidebar`, () => qa(".sb-repo-name").map(text).includes(cfg.repoName));
    }
    (await waitFor("Create workspace button", () => q(`.sb-repo-add[aria-label="Create workspace in ${cfg.repoName}"]`))).click();
    (await waitFor("the Create workspace dialog", () => q('form.create-ws button[type="submit"]'))).click();
    await waitFor("the workspace view", () => q(".workspace .composer textarea"), 60000);
    await waitFor("the model chip", () => chip());
    // A Reason chat: the chip names no CLI agent.
    if (["Codex", "Claude Code"].some((l) => text(chip()).includes(l))) throw new Error(`not a Reason chat: ${text(chip())}`);
    await sleep(1500);
    step("workspace created", { name: text(q(".ws-title strong")) });

    report.beforeTurn = await snapshot("1-before-turn");
    report.turn1 = await turn(cfg.prompt);
    step("turn 1 ended", report.turn1);
    report.afterTurn = await snapshot("2-after-turn");

    // Pick another of Reason's models from the list, when it lists it.
    await openMenu();
    const search = q(".oc-model-search input");
    setValue(search, cfg.pick);
    await sleep(400);
    const target = qa(".oc-model-menu .oc-model-item").find((b) => text(b.querySelector(".oc-model-item-name")) === cfg.pick);
    report.pickFound = !!target;
    if (target) {
      await saveDom("3-search");
      target.click();
      await sleep(1500);
      report.afterPick = { chip: chipState() };
      step("picked", report.afterPick);
      report.turn2 = await turn(cfg.prompt);
      step("turn 2 ended", report.turn2);
      report.afterPickTurn = await snapshot("4-after-pick-turn");
    } else {
      report.pickRows = rows().map((r) => r.name);
      step("pick not listed", { query: cfg.pick, rows: report.pickRows });
      await closeMenu();
    }
    report.result = "done";
  } catch (e) {
    report.error = `${e && e.message ? e.message : e}`;
    step("failed", { error: report.error, chip: chip() ? text(chip()) : null, sidebar: qa("button.sb-row .sb-row-label").map(text).slice(0, 12) });
    await saveDom("failure").catch(() => {});
  }
  report.ended = new Date().toISOString();
  await invoke("e2e_report", { name: "model-picker", data: report });
})();
