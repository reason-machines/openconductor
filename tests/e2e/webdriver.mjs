// Minimal W3C WebDriver client for tauri-driver (no dependencies).
const ELEMENT = "element-6066-11e4-a52e-4f735466cecf";

// Repaints a 1px transparent outline every 50 ms for arguments[0] ms. See screenshot().
const REPAINT_START = `
let el = document.getElementById("__oc_e2e_repaint");
if (!el) {
  el = document.createElement("div");
  el.id = "__oc_e2e_repaint";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none";
  document.documentElement.appendChild(el);
}
clearInterval(window.__ocE2eRepaint);
const until = Date.now() + arguments[0];
window.__ocE2eRepaint = setInterval(() => {
  el.style.outline = el.style.outline ? "" : "1px solid transparent";
  if (Date.now() > until) clearInterval(window.__ocE2eRepaint);
}, 50);`;
// What sits at the centre of arguments[0], for an intercepted click.
const CLICK_TARGET = `
const el = arguments[0];
const describe = (e) => {
  if (!e) return "nothing";
  const cs = getComputedStyle(e);
  const r = e.getBoundingClientRect();
  const attrs = [...e.attributes].filter((a) => a.name !== "style" && a.name !== "d").map((a) => a.name + "=" + JSON.stringify(a.value.slice(0, 60))).join(" ");
  return "<" + e.tagName.toLowerCase() + " " + attrs + "> rect " + [r.x, r.y, r.width, r.height].map(Math.round).join(",") + " opacity " + cs.opacity + " transform " + cs.transform + " pe " + cs.pointerEvents + " text " + JSON.stringify((e.textContent || "").trim().slice(0, 80));
};
const r = el.getBoundingClientRect();
const x = r.x + r.width / 2, y = r.y + r.height / 2;
const stack = document.elementsFromPoint(x, y).slice(0, 4);
const chain = (e) => { const out = []; for (let n = e; n && n !== document.body && out.length < 4; n = n.parentElement) out.push(n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\\s+/).join(".") : "")); return out.join(" < "); };
return "target " + describe(el) + " at " + Math.round(x) + "," + Math.round(y) + " in " + innerWidth + "x" + innerHeight + "; on top: " + stack.map((e) => describe(e) + " [" + chain(e) + "]").join(" | ") + "; toasts: " + [...document.querySelectorAll(".toast")].map(describe).join(" | ");`;

const REPAINT_STOP = `clearInterval(window.__ocE2eRepaint); document.getElementById("__oc_e2e_repaint")?.remove();`;

export class WebDriver {
  constructor(base = "http://127.0.0.1:4444", requestTimeoutMs = 30000) {
    this.base = base;
    this.requestTimeoutMs = requestTimeoutMs;
    this.sessionId = null;
  }

  async #call(method, path, body, timeoutMs = this.requestTimeoutMs) {
    let res;
    let json;
    try {
      res = await fetch(this.base + path, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      json = await res.json();
    } catch (cause) {
      const detail = cause?.name === "TimeoutError"
        ? `timed out after ${timeoutMs} ms`
        : `transport failed: ${cause?.message ?? cause}`;
      const error = new Error(`${method} ${path} ${detail}`, { cause });
      error.name = cause?.name ?? "Error";
      throw error;
    }
    if (!res.ok || json?.value?.error) {
      const err = json?.value ?? {};
      throw new Error(`${method} ${path} -> ${res.status} ${err.error ?? ""}: ${err.message ?? ""}`);
    }
    return json.value;
  }

  #s(path) {
    return `/session/${this.sessionId}${path}`;
  }

  async newSession(application) {
    const value = await this.#call("POST", "/session", {
      capabilities: { alwaysMatch: { "tauri:options": { application } } },
    });
    this.sessionId = value.sessionId;
    return value;
  }

  async waitForAppReady(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.execute(
          'const app = document.querySelector(".app"); return app ? { startup: app.dataset.startup, busy: app.getAttribute("aria-busy") } : null;',
          [],
          Math.max(1, deadline - Date.now()),
        );
      } catch (error) {
        last = error instanceof Error ? error.message : String(error);
      }
      if (last?.startup === "error") throw new Error("app startup failed: workspace-store loading returned an error");
      if (last?.startup === "ready" && last.busy === "false") return;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(250, deadline - Date.now()))));
    }
    throw new Error(`timed out waiting for app startup after ${timeoutMs} ms; last: ${JSON.stringify(last)}`);
  }

  async deleteSession() {
    if (!this.sessionId) return;
    await this.#call("DELETE", this.#s("")).catch(() => undefined);
    this.sessionId = null;
  }

  execute(script, args = [], timeoutMs) {
    return this.#call("POST", this.#s("/execute/sync"), { script, args }, timeoutMs);
  }

  async findAll(css) {
    const els = await this.#call("POST", this.#s("/elements"), { using: "css selector", value: css });
    // W3C key, else the legacy JSON Wire `ELEMENT` key.
    return els.map((e) => {
      const id = e[ELEMENT] ?? e.ELEMENT;
      if (typeof id !== "string") throw new Error(`unrecognised element reference ${JSON.stringify(e)}`);
      return id;
    });
  }

  text(id) {
    return this.#call("GET", this.#s(`/element/${id}/text`));
  }

  async click(id) {
    try {
      return await this.#call("POST", this.#s(`/element/${id}/click`), {});
    } catch (e) {
      // WebKitWebDriver's "element click intercepted" message is empty: name what is on top.
      if (!/intercepted/.test(String(e?.message))) throw e;
      const top = await this.execute(CLICK_TARGET, [{ [ELEMENT]: id }]).catch((x) => `(no detail: ${x?.message ?? x})`);
      throw new Error(`${e.message} ${top}`);
    }
  }

  /** Type into whatever has focus with real key events ("\uE007" is Enter). */
  keys(text) {
    const actions = [...text].flatMap((value) => [
      { type: "keyDown", value },
      { type: "keyUp", value },
    ]);
    return this.#call("POST", this.#s("/actions"), { actions: [{ type: "key", id: "keyboard", actions }] });
  }

  /** Press `key` while holding `modifiers` (WebDriver key codes, e.g. "\uE03D" Meta, "\uE009" Control). */
  chord(modifiers, key) {
    const actions = [
      ...modifiers.map((value) => ({ type: "keyDown", value })),
      { type: "keyDown", value: key },
      { type: "keyUp", value: key },
      ...[...modifiers].reverse().map((value) => ({ type: "keyUp", value })),
    ];
    return this.#call("POST", this.#s("/actions"), { actions: [{ type: "key", id: "keyboard", actions }] });
  }

  title() {
    return this.#call("GET", this.#s("/title"));
  }

  /**
   * PNG of the window. WebKitGTK takes it only after the page's next paint
   * (WebAutomationSession::takeScreenshot waits on callAfterNextPresentationUpdate),
   * so on an idle page, one with nothing left to repaint, the request never
   * returns; Node's fetch then gives up after its 300 s headers timeout. Keep an
   * invisible element repainting until the snapshot is taken, and bound the wait.
   */
  async screenshot(timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    const remaining = () => Math.max(1, deadline - Date.now());
    try {
      await this.execute(REPAINT_START, [timeoutMs], remaining());
      return Buffer.from(await this.#call("GET", this.#s("/screenshot"), undefined, remaining()), "base64");
    } catch (e) {
      if (e?.name !== "TimeoutError") throw e;
      throw new Error(`screenshot timed out after ${timeoutMs} ms: WebKit did not answer before the capture deadline`);
    } finally {
      await this.execute(REPAINT_STOP, [], remaining()).catch(() => undefined);
    }
  }

  /** Poll `fn` until it returns a truthy value or `timeoutMs` passes. */
  async waitFor(what, fn, timeoutMs = 30000) {
    const end = Date.now() + timeoutMs;
    let last;
    while (Date.now() < end) {
      try {
        const v = await fn();
        if (v) return v;
      } catch (e) {
        last = e;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`timed out waiting for ${what}${last ? `: ${last.message}` : ""}`);
  }
}
