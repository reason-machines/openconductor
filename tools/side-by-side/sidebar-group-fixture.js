// Invented local-account workspaces; mirrors the reference seed's effective statuses.
(() => {
  const query = new URLSearchParams(location.search);
  if (location.hostname !== 'localhost' || query.get('oc_group_fixture') !== '1') return;
  const state = JSON.parse(localStorage.getItem('openconductor.shell.v1'));
  for (const repo of state.repos) for (const workspace of repo.workspaces) {
    workspace.derivedStatus = workspace.id === 'ws-accra' ? 'done' : workspace.id === 'ws-quito' ? 'in-review' : 'in-progress';
  }
  localStorage.setItem('openconductor.shell.v1', JSON.stringify(state));
})();
