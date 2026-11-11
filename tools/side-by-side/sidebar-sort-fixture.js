(() => {
  const query = new URLSearchParams(location.search);
  if (query.get('oc_org') !== 'local') return;
  const base = window.__OC_ORG_FIXTURES__;
  if (base) {
    window.__OC_ORG_FIXTURES__ = (mode) => {
      if (mode !== 'local') return base(mode);
      const fixtures = base('cloud');
      fixtures['GET /organizations'] = { organizations: [{
        id: 'org_demo_0001', slug: 'ada-demo', name: 'Ada Demo', kind: 'personal',
        onboardingComplete: true, newMemberOnboardingComplete: true, plan: 'free',
        entitlements: [], supportsLocal: true,
      }] };
      fixtures['GET /organizations/org_demo_0001/default-machine'] = {};
      return fixtures;
    };
  }
  if (query.get('oc_sort_fixture') !== '1') return;
  const created = { 'ws-lisbon': '2026-01-03T00:00:00.000Z', 'ws-osaka': '2026-01-01T00:00:00.000Z', 'ws-quito': '2026-01-02T00:00:00.000Z' };
  const seed = window.__OC_SEED__;
  if (seed) window.__OC_SEED__ = (scenario) => {
    const data = seed(scenario);
    data.conductor += Object.entries(created).map(([id, date]) => `UPDATE workspaces SET created_at='${date}' WHERE local_id='${id}';`).join('\n');
    return data;
  };
  if (location.hostname === 'localhost') {
    const state = JSON.parse(localStorage.getItem('openconductor.shell.v1'));
    for (const repo of state.repos) for (const workspace of repo.workspaces) {
      if (created[workspace.id]) workspace.createdAt = Date.parse(created[workspace.id]);
    }
    localStorage.setItem('openconductor.shell.v1', JSON.stringify(state));
    window.__OC_SORT_FIXTURE__ = () => {
      const original = window.__TAURI_INTERNALS__.invoke;
      const prefs = {
        garry_mode: false, experimental_show_agent_cost: false, experimental_tab_freak_mode: false,
        experimental_new_workspace_page: false, graphite_disabled: false, default_open_in: null,
        open_in_mru_order: [], left_panel_visible: true, right_panel_visible: true, left_panel_width: 256,
        onboarding_step: 0, first_time_onboarding_step: 999, last_clone_directory: null,
        last_seen_announcement: null, roundhouse_client_user_id: null, sidebar_repo_filter: null,
        sidebar_sort_by: localStorage.getItem('openconductor.sidebar_sort_by') || 'updated',
        sidebar_group_by: localStorage.getItem('openconductor.sidebar_group_by') || 'repo',
        sidebar_resource_usage: false, message_send_key: 'enter', dashboard_enabled: false, chrome_mode_enabled: false,
      };
      window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
        if (cmd === 'get_app_prefs') return { ...prefs };
        if (cmd === 'set_app_pref') {
          prefs[args.update.key] = args.update.value;
          localStorage.setItem('openconductor.' + args.update.key, args.update.value);
          return { ...prefs };
        }
        return original(cmd, args);
      };
    };
  }
})();
