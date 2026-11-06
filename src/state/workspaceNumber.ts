// "Show workspace numbers" (Conductor's Experimental `experimental_show_workspace_numbers`,
// off by default): `W-<n>` beside a workspace's name in Home, the workspace switcher
// and the workspace header. Conductor's sidebar rows never show it (REA, renderApp
// chunk: the setting's only reader `_zt`/`NYe` has those consumers and the link chip).

/** `W-<n>` for a numbered workspace; null for one from before numbering. */
export function workspaceNumberLabel(number: number | null | undefined): string | null {
  return number == null ? null : `W-${number}`;
}
