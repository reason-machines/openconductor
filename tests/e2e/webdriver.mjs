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
const REPAINT_STOP = `clearInterval(window.__ocE2eRepaint); document.getElementById("__oc_e2e_repaint")?.remove();`;

export class WebDriver {
  constructor(base = "http://127.0.0.1:4444") {
    this.base = base;
    this.sessionId = null;
  }

  async #call(method, path, body, timeoutMs) {
    const res = await fetch(this.base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => ({}));
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

  async deleteSession() {
    if (!this.sessionId) return;
    await this.#call("DELETE", this.#s("")).catch(() => undefined);
    this.sessionId = null;
  }

  execute(script, args = []) {
    return this.#call("POST", this.#s("/execute/sync"), { script, args });
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

  click(id) {
    return this.#call("POST", this.#s(`/element/${id}/click`), {});
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
    await this.execute(REPAINT_START, [timeoutMs]);
    try {
      return Buffer.from(await this.#call("GET", this.#s("/screenshot"), undefined, timeoutMs), "base64");
    } catch (e) {
      if (e?.name !== "TimeoutError") throw e;
      throw new Error(`screenshot timed out after ${timeoutMs} ms: WebKit painted no frame even with the page forced to repaint, so the webview may be stuck`);
    } finally {
      await this.execute(REPAINT_STOP).catch(() => undefined);
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
