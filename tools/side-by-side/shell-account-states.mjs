// The sidebar's Account menu and Help menu for tools/side-by-side/help-diagnostics.mjs:
//
//   npm run build && SBS_STATES=tools/side-by-side/shell-account-states.mjs \
//     DIST_REF=.rea-work/dist VIEWPORT=1280x820 TMPDIR=/tmp/t REA=<rea> \
//     [UIMAP_RECORD=parity/ui-map/side-by-side.json] \
//     node tools/side-by-side/help-diagnostics.mjs <out-dir> [state ...]
//
// Conductor's harness is signed in as Ada Demo (ada@example.com), so its Account menu
// (`zna`) reads "Ada Demo's Mac" with the email, Settings and Log out. OpenConductor's
// side answers `local_account` with the same person and `reason_account_status` with a
// Reason account for that email: OpenConductor's account is Reason's, and its Log out
// signs out of it.
export const ocInvoke = {
  local_account: { name: "Ada Demo", email: "ada@example.com" },
  reason_account_status: {
    version: "0.0.0", name: "Ada Demo", email: "ada@example.com", credential: "login", error: null,
    organization: null, workspaces: [], computerConnected: false,
  },
};

export default ({ css }) => ({
  "account-menu": { ref: [css("[aria-label='Account menu']")], oc: [css(".sb-computer")], uiMap: "menu-account", image: "shell-account-01-menu.png" },
});
