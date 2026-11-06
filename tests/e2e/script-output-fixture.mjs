import { FILES, SHELL, fakeBackend } from "./right-panel-fixture.mjs";

export const SCRIPT_LOG = "\x1b[32mDependencies installed\x1b[0m\r\nProgress 10%\r\x1b[2KProgress 100%\r\n\x1b[34mReady on localhost:55000\x1b[0m\r\n";

export function scriptOutputBackend({ output, kind = "setup", running = false }) {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const callbacks = new Map();
  const transformCallback = window.__TAURI_INTERNALS__.transformCallback;
  let listener;
  let state = running ? "running" : kind === "setup" ? "completed" : "stopped";
  window.__TAURI_INTERNALS__.transformCallback = (f, once) => {
    const id = transformCallback(f, once);
    callbacks.set(id, f);
    return id;
  };
  window.__scriptOutputTest = {
    setOutput(next) { output = next; },
    finish() {
      state = "completed";
      callbacks.get(listener)?.({ event: "scripts://event", payload: { type: "setupFinished", workspaceId: "w1", state, exitCode: 0, logPath: "/synthetic/setup.log", log: output } });
    },
    emit(chunk) {
      output += chunk;
      callbacks.get(listener)?.({ event: "scripts://event", payload: { type: "output", workspaceId: "w1", kind, scriptId: kind === "run" ? "run" : "setup", chunk } });
    },
  };
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    if (cmd === "plugin:event|listen" && args.event === "scripts://event") listener = args.handler;
    if (cmd === "setup_script_status") return { state: kind === "setup" ? state : "idle", log: kind === "setup" ? output : null, last: null };
    if (cmd === "setup_script_start") { state = "running"; output = ""; return true; }
    if (cmd === "setup_script_cancel") { state = "cancelled"; return; }
    if (cmd === "run_script_status") return { runs: kind === "run" ? [{ workspaceId: "w1", scriptId: "run", state, exit: [0, null] }] : [], history: [] };
    if (cmd === "run_script_output") return kind === "run" ? output : null;
    return invoke(cmd, args);
  };
}

export function outputInit(kind = "setup", running = false) {
  return `(${fakeBackend})(${JSON.stringify({ shell: SHELL, files: FILES, setupScript: "npm install", runScript: "npm run dev" })});(${scriptOutputBackend})(${JSON.stringify({ output: SCRIPT_LOG, kind, running })});`;
}
