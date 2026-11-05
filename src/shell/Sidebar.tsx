export function Sidebar() {
  return (
    <aside className="app-sidebar" aria-label="Workspaces">
      <div className="sidebar-header" data-tauri-drag-region>
        <span className="brand">OpenConductor</span>
      </div>
      <nav className="sidebar-body">
        <p className="muted small">No workspaces yet</p>
      </nav>
    </aside>
  );
}
