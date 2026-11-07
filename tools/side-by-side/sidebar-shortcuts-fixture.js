(() => {
  const query = new URLSearchParams(location.search);
  if (query.get('oc_shortcut_fixture') !== '1') return;
  const state = JSON.parse(localStorage.getItem('openconductor.shell.v1'));
  state.sections = [{ id: 'focus', name: 'Focus', workspaceIds: ['ws-lisbon', 'ws-accra'] }];
  state.sidebarStatusCollapsed = Object.fromEntries(['backlog', 'in-progress', 'in-review', 'done', 'canceled'].map((status) => [status, false]));
  for (const repo of state.repos) {
    repo.collapsed = false;
    for (const workspace of repo.workspaces) {
      if (workspace.id === 'ws-quito') workspace.pinnedAt = 1;
    }
  }
  localStorage.setItem('openconductor.shell.v1', JSON.stringify(state));
  localStorage.setItem('openconductor.sidebar_group_by', query.get('oc_group_by') || 'repo');
  localStorage.removeItem('openconductor.sidebar_repo_filter');
})();
