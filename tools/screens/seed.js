// Synthetic seed data per scenario (invented; no real users, repos or tokens).
// Returns { conductor: SQL, cache: SQL, vfs: {absolutePath: text}, sidecarRequests: [JSON-RPC request] }.
(function () {
  const APP = "/Users/demo/Library/Application Support/com.conductor.app";

  // Conductor's file-backed "browser-local-storage" subsystem, in the exact
  // layout the app itself wrote when the theme was switched in Settings >
  // Appearance under this harness.
  function themeVfs(mode) {
    const value = JSON.stringify(mode);
    return {
      [`${APP}/local-storage.subsystem.browser-local-storage.json`]: JSON.stringify({ "melty-theme-selected-mode": value }),
      [`${APP}/local-storage.metadata.json`]: JSON.stringify({
        "browser-local-storage": {
          subsystem: "browser-local-storage",
          sizeLimit: 5242880,
          totalSize: value.length,
          entryStorage: "subsystemStore",
          entries: [{ id: "melty-theme-selected-mode", size: value.length, lastUpdatedAt: "2026-11-05T10:00:00.000Z" }],
        },
      }),
    };
  }

  window.__OC_SEED__ = function (scenario) {
    const theme = new URLSearchParams(location.search).get("oc_theme") || "dark";
    const data = (window.__OC_SEED_DATA__ && window.__OC_SEED_DATA__[scenario]) || {};
    return { conductor: data.conductor || "", cache: data.cache || "", vfs: { ...themeVfs(theme), ...(data.vfs || {}) }, sidecarRequests: data.sidecarRequests || [], http: data.http || {} };
  };
})();
