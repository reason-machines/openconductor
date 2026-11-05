import { UserEnvironmentRows } from "./rows/EnvironmentRows";
import type { Settings } from "./types";

/**
 * Settings › Agents & environment › Environment (`/settings/user/environment`).
 * Conductor's environment panel (user and repository scope): "Environment
 * variables, files, and preview URLs." Conductor lists this user tab only
 * without a cloud organization, which is every OpenConductor user.
 */
export function EnvironmentPage({ settings, save }: { settings: Settings; save: (next: Settings) => void }) {
  return <UserEnvironmentRows settings={settings} save={save} />;
}
