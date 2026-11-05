/**
 * Settings › Agents & environment › Environment (`/settings/user/environment`).
 * Conductor's environment panel (user and repository scope): "Environment
 * variables, files, and preview URLs." Conductor lists this user tab only
 * without a cloud organization, which is every OpenConductor user. Its rows
 * are mounted here as the environment settings are built.
 */
export function EnvironmentPage() {
  return (
    <div className="settings-rows">
      <div className="settings-row">
        <div>
          <div className="settings-row-label">Environment settings</div>
          <div className="muted small">Environment variables, files, and preview URLs. Not editable here yet.</div>
        </div>
      </div>
    </div>
  );
}
