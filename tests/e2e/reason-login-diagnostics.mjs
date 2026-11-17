export function installReasonLoginDiagnostics(scope) {
  const document = scope.document;
  const internals = scope.__TAURI_INTERNALS__;
  const original = internals?.invoke;
  if (typeof original !== "function") throw new Error("Reason diagnostics unavailable");
  const sectionSelector = 'section[aria-label="Reason"]';
  const controlsSelector = `${sectionSelector} [data-testid="reason-sign-in-controls"]`;
  const buttonSelector = `${controlsSelector} > button`;
  const commands = new Set(["reason_login_start", "reason_login_status", "reason_login_cancel", "reason_account_status"]);
  const states = new Set(["idle", "checking", "starting", "waiting", "connected", "cancelled", "timedOut", "failed"]);
  const records = [];
  let truncated = false;
  let closed = false;
  const record = (value) => {
    if (closed) return;
    if (records.length < 256) records.push(value);
    else truncated = true;
  };
  const stateOf = (value) => {
    try {
      const state = value?.state;
      return states.has(state) ? state : "unknown";
    } catch {
      return "unreadable";
    }
  };
  const sample = (phase) => {
    const controls = document.querySelector(controlsSelector);
    const button = document.querySelector(buttonSelector);
    record({
      kind: "button",
      phase,
      identity: button ? "reason-sign-in-primary" : "missing",
      disabled: button ? button.disabled === true : null,
      connected: button ? button.isConnected === true : null,
      state: stateOf({ state: controls?.dataset.state }),
    });
  };
  const observeClick = (phase) => (event) => {
    if (closed) return;
    const section = document.querySelector(sectionSelector);
    if (!section?.contains(event.target)) return;
    const button = document.querySelector(buttonSelector);
    record({
      kind: "click",
      phase,
      target: button?.contains(event.target) ? "reason-sign-in-primary" : "other-in-reason-section",
      trusted: event.isTrusted === true,
      disabled: button ? button.disabled === true : null,
      connected: button ? button.isConnected === true : null,
    });
  };
  const capture = observeClick("capture");
  const bubble = observeClick("bubble");
  function invoke(command, ...args) {
    if (closed || !commands.has(command)) return Reflect.apply(original, this, [command, ...args]);
    record({ kind: "ipc", command, phase: "call" });
    let result;
    try {
      result = Reflect.apply(original, this, [command, ...args]);
    } catch (error) {
      record({ kind: "ipc", command, phase: "threw" });
      throw error;
    }
    Promise.resolve(result).then(
      (value) => record({ kind: "ipc", command, phase: "resolved", state: stateOf(value) }),
      () => record({ kind: "ipc", command, phase: "rejected" }),
    );
    return result;
  }
  const cleanup = () => {
    closed = true;
    let captureRemoved = false;
    let bubbleRemoved = false;
    let restoredInvoke = false;
    try { document.removeEventListener("click", capture, true); captureRemoved = true; } catch {}
    try { document.removeEventListener("click", bubble, false); bubbleRemoved = true; } catch {}
    try {
      if (internals.invoke === invoke) internals.invoke = original;
      restoredInvoke = internals.invoke === original;
    } catch {}
    return { captureRemoved, bubbleRemoved, restoredInvoke };
  };
  try {
    internals.invoke = invoke;
    document.addEventListener("click", capture, true);
    document.addEventListener("click", bubble, false);
  } catch (error) {
    cleanup();
    throw error;
  }
  return {
    sample(phase) {
      if (!closed) sample(phase === "after-click" ? "after-click" : "before-click");
    },
    finish() {
      let restored;
      try {
        if (!closed) sample("finish");
      } finally {
        restored = cleanup();
      }
      return { records: records.slice(), truncated, ...restored };
    },
  };
}

export async function traceReasonLogin(wd, click, waitForCode, emit = console.log) {
  const key = "__OC_REASON_LOGIN_DIAGNOSTICS__";
  const output = (value) => {
    try { emit(`[reason-login-diagnostics] ${JSON.stringify(value)}`); } catch {}
  };
  let installed = false;
  try {
    await wd.execute(`
      if (window.${key}) throw new Error("Reason diagnostics already installed");
      const observer = (${installReasonLoginDiagnostics.toString()})(window);
      try {
        observer.sample("before-click");
        window.${key} = observer;
      } catch (error) {
        observer.finish();
        throw error;
      }
    `, []);
    installed = true;
  } catch {
    output({ status: "install-unavailable" });
  }
  try {
    await click();
    if (installed) {
      try { await wd.execute(`window.${key}.sample("after-click");`, []); }
      catch { output({ status: "after-click-unavailable" }); }
    }
    return await waitForCode();
  } finally {
    if (installed) {
      try {
        const result = await wd.execute(`
          try { return window.${key}.finish(); }
          finally { delete window.${key}; }
        `, []);
        output(result);
      } catch {
        output({ status: "finish-unavailable" });
      }
    }
  }
}
