// Minimal W3C WebDriver client for tauri-driver (no dependencies).
const ELEMENT = "element-6066-11e4-a52e-4f735466cecc";

export class WebDriver {
  constructor(base = "http://127.0.0.1:4444") {
    this.base = base;
    this.sessionId = null;
  }

  async #call(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
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
    // W3C key, else the legacy JSON Wire `ELEMENT` key older WebKitWebDriver builds return.
    return els.map((e) => {
      const id = e[ELEMENT] ?? e.ELEMENT ?? Object.values(e)[0];
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

  screenshot() {
    return this.#call("GET", this.#s("/screenshot")).then((b64) => Buffer.from(b64, "base64"));
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
