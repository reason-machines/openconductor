(function () {
  if (!new URLSearchParams(location.search).has("oc_script_output")) return;
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const lifecycle = new URLSearchParams(location.search).get("oc_terminal_lifecycle");
  const setupState = new URLSearchParams(location.search).get("oc_setup_state");
  const output = "\x1b[32mDependencies installed\x1b[0m\r\nProgress 10%\r\x1b[2KProgress 100%\r\n\x1b[34mReady on localhost:55000\x1b[0m\r\n";
  window.__TAURI_INTERNALS__.invoke = async function (cmd, args, options) {
    if ((cmd === "plugin:fs|stat" || cmd === "plugin:fs|lstat") && /^\/Users\/demo\/code\/tide-web\/(osaka|lisbon)$/.test(args.path)) {
      return { isFile: false, isDirectory: true, isSymlink: false, size: 0, mtime: null, atime: null, birthtime: null, readonly: false };
    }
    if (cmd === "pty_spawn") {
      const id = args.args.id;
      if (lifecycle === "starting") return new Promise(() => {});
      if (lifecycle === "exited" || setupState === "completed" || setupState === "failed") {
        setTimeout(() => window.__OC_EMIT__("pty-exit", { type: "pty.exit", id, exitCode: setupState === "failed" ? 7 : 0 }), 700);
      }
      setTimeout(() => window.__OC_EMIT__("pty-ready", { type: "pty.ready", id, pid: 12345 }), 20);
      setTimeout(() => window.__OC_EMIT__("pty-data", { type: "pty.data", id, data: btoa(output), byteLength: output.length }), 200);
      return null;
    }
    if (cmd === "pty_screen_text") return "Dependencies installed\nProgress 100%\nReady on localhost:55000\n";
    if (cmd === "pty_screen_snapshot") return { snapshotAnsi: output, rehydrateSequences: "", cwd: "/Users/demo/code/tide-web/osaka", cols: 80, rows: 24, modes: { alternateScreen: false, bracketedPaste: false } };
    if (["pty_resize", "pty_ack_bytes", "pty_kill", "pty_write_mirror", "pty_persist_terminal_history"].includes(cmd)) return null;
    return invoke(cmd, args, options);
  };
})();
