(() => {
  if (new URLSearchParams(location.search).get('oc_number_fixture') !== '1') return;
  if (window.__OC_SEED__) {
    const seed = window.__OC_SEED__;
    window.__OC_SEED__ = (...args) => {
      const value = seed(...args);
      return { ...value, conductor: value.conductor + "\nINSERT OR REPLACE INTO settings (key, value) VALUES ('experimental_show_workspace_numbers', 'true');" };
    };
  } else {
    const state = JSON.parse(localStorage.getItem('openconductor.shell.v1'));
    state.repos.forEach((repo) => repo.workspaces.forEach((workspace, index) => { workspace.number = index + 1; }));
    if (new URLSearchParams(location.search).get('oc_number_surface') === 'home') state.selection = { kind: 'home' };
    localStorage.setItem('openconductor.shell.v1', JSON.stringify(state));
    const settings = JSON.parse(localStorage.getItem('openconductor.settings.preview'));
    settings.experimental = { ...settings.experimental, experimental_show_workspace_numbers: true };
    localStorage.setItem('openconductor.settings.preview', JSON.stringify(settings));
  }
})();
