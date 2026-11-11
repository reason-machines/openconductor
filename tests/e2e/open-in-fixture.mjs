export function installOpenInBackend({ apps, initialPrefs, palette, workspaceTitle }) {
  const original = window.__TAURI_INTERNALS__.invoke;
  let prefs = initialPrefs;
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    if (cmd === "open_in_apps") return apps;
    if (cmd === "get_settings" && palette) {
      const settings = await original(cmd, args);
      return { ...settings, appearance: { ...settings.appearance, color_palette: palette } };
    }
    if (cmd === "db_list_workspaces" && workspaceTitle) return (await original(cmd, args)).map((row) => ({ ...row, workspaceName: workspaceTitle }));
    if (cmd === "get_app_prefs") return structuredClone(prefs);
    if (cmd === "record_open_in") {
      window.__fake.calls.push({ cmd, ...args });
      prefs = { ...prefs, default_open_in: args.appId, open_in_mru_order: [args.appId + "|local", ...prefs.open_in_mru_order.filter((x) => x !== args.appId + "|local")] };
      return structuredClone(prefs);
    }
    if (cmd === "plugin:clipboard-manager|write_text") { window.__fake.calls.push({ cmd, ...args }); return; }
    return original(cmd, args);
  };
}
