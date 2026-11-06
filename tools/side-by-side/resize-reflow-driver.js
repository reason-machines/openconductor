// In-app driver for the resize-reflow check in the built OpenConductor app on a
// Mac, evaluated in the main window by the debug-only seam in
// src-tauri/src/e2e.rs (OC_E2E_SIZE sets the window size first).
// tools/side-by-side/resize-reflow-mac.sh prepends the config:
//   window.__OC_E2E__ = { repo, rows }   rows: chat_messages_save upserts
// First load: finish onboarding, add the fixture repo, create a workspace,
// store the rows as its chat, select it and reload. Second load: wait for the
// turns, scroll to the end, measure the layout, check it against Conductor's
// rules (the same as tools/align/reflow_ours.mjs, which measures the Vite build
// in Chromium) and report "resize-reflow" with `failures`:
//   - sidebar 256; right panel a third of the rest, ending at the window edge
//   - turns min(896, column), centred; composer min(896, column - 32), centred
//   - nothing drawn past the window edge outside a scroll or clip box
//   - the Run tab's "Add run script" label on one line (Conductor's Button is whitespace-nowrap)
(async () => {
  if (window.__OC_E2E_RUNNING__) return;
  window.__OC_E2E_RUNNING__ = true;
  const cfg = window.__OC_E2E__;
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(what, fn, ms = 60000) {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(200);
    }
  }
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  try {
    if (sessionStorage.getItem("oc-resize-seeded") !== "1") {
      await invoke("db_finish_first_run_onboarding");
      const repo = await invoke("add_repository", { path: cfg.repo });
      const { workspace } = await invoke("create_workspace", { repositoryId: repo.id, branchName: "ada/fix-login-redirect", directoryName: "lisbon", baseBranch: null, existingBranch: false, prNumber: null });
      const upserts = cfg.rows.map((full) => {
        const m = JSON.parse(full);
        const text = m.blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        return { id: m.id, role: m.role, content: text, createdAt: m.createdAt, turnId: m.turnId, sentAt: m.createdAt, cancelledAt: null, senderSessionId: null, senderApiKeyName: null, fullMessage: full.replaceAll(cfg.chatPlaceholder, workspace.id) };
      });
      for (const u of upserts) u.id = u.id.replaceAll(cfg.chatPlaceholder, workspace.id);
      for (const u of upserts) u.turnId = u.turnId.replaceAll(cfg.chatPlaceholder, workspace.id);
      await invoke("chat_messages_save", { chatId: workspace.id, upserts, deleteIds: [], agentSessionId: null, rewindTo: null });
      localStorage.setItem("openconductor.shell.prefs.v1", JSON.stringify({ selection: { kind: "workspace", repoId: workspace.repositoryId, workspaceId: workspace.id }, collapsed: [] }));
      sessionStorage.setItem("oc-resize-seeded", "1");
      location.reload();
      return;
    }
    await waitFor("three stored turns", () => qa(".oc-turn").length >= 3 && q(".composer.oc-composer"));
    await sleep(1500);
    const list = q(".chat-scroll:not([hidden])");
    list.scrollTop = list.scrollHeight;
    await sleep(500);
    const clipped = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement)
        if (getComputedStyle(p).overflowX !== "visible" && p.getBoundingClientRect().right <= innerWidth + 0.5) return true;
      return false;
    };
    const turns = qa(".oc-turn");
    const data = {
      window: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      sidebar: box(q(".sidebar")),
      main: box(q(".chat")),
      rightPanel: box(q(".ws-right")),
      list: box(list),
      listClientWidth: list.clientWidth,
      turns: turns.map(box),
      turnBodies: turns.map((t) => box(t.querySelector(".oc-turn-body"))),
      composer: box(q(".composer.oc-composer")),
      horizontalOverflow: { list: list.scrollWidth > list.clientWidth, page: document.documentElement.scrollWidth > innerWidth },
      escaping: qa(".workspace *")
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > innerWidth + 0.5 && !clipped(el);
        })
        .slice(0, 10)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`),
    };
    // The button's box is a fixed 32px; a wrapped label overflows it, so count the label's lines.
    const runBtn = q(".scripts-empty-btn");
    data.runButton = box(runBtn);
    if (runBtn) {
      const range = document.createRange();
      range.selectNodeContents(runBtn);
      data.runButtonLines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    }
    const fail = [];
    const near = (a, b, what, tol = 1.5) => Math.abs(a - b) > tol && fail.push(`${what}: ${a} != ${b}`);
    near(data.sidebar.w, 256, "sidebar width");
    near(data.rightPanel.w, (innerWidth - data.sidebar.w) / 3, "right panel a third of the rest", 2);
    near(data.rightPanel.x + data.rightPanel.w, innerWidth, "right panel ends at the window edge");
    const col = data.listClientWidth;
    for (const [i, t] of data.turns.entries()) {
      near(t.w, Math.min(896, col), `turn ${i} width`);
      if (col >= 896) near(t.x + t.w / 2, data.list.x + col / 2, `turn ${i} centre`);
    }
    near(data.composer.w, Math.min(896, data.main.w - 32), "composer width");
    near(data.composer.x + data.composer.w / 2, data.main.x + data.main.w / 2, "composer centre");
    if (data.horizontalOverflow.list || data.horizontalOverflow.page) fail.push(`horizontal overflow ${JSON.stringify(data.horizontalOverflow)}`);
    if (data.escaping.length) fail.push(`drawn past the window edge: ${data.escaping.join(", ")}`);
    if (data.runButtonLines > 1) fail.push(`"Add run script" wraps onto ${data.runButtonLines} lines`);
    data.failures = fail;
    await invoke("e2e_report", { name: "resize-reflow", data });
  } catch (e) {
    await invoke("e2e_report", { name: "resize-reflow", data: { error: String(e && e.stack ? e.stack : e) } });
  }
})();
