// Command palette and sidebar footer menu states for tools/side-by-side/help-diagnostics.mjs:
//
//   npm run build && SBS_STATES=tools/side-by-side/shell-palette-states.mjs \
//     DIST_REF=.rea-work/dist VIEWPORT=1280x820 TMPDIR=/tmp/t REA=<rea> \
//     [UIMAP_RECORD=parity/ui-map/side-by-side.json] \
//     node tools/side-by-side/help-diagnostics.mjs <out-dir> [state ...]
//
// Both sides open on Home with the populated seed. The palette opens with Cmd+K
// (Conductor's `h_a` dialog around `m_a`, renderApp @10,888,900); search types
// "login" into its input and no-results "zzqx", as tools/ui-map/states.json does for the UI map.
export default ({ css }) => {
  const OPEN = { press: "Meta+k" };
  const SEARCH = { fill: [css("[role=dialog] input"), "login"] };
  const NONE = { fill: [css("[role=dialog] input"), "zzqx"] };
  return {
    "palette-all": { ref: [OPEN], oc: [OPEN], uiMap: "palette-all", image: "shell-palette-01-all.png" },
    "palette-search": { ref: [OPEN, SEARCH], oc: [OPEN, SEARCH], uiMap: "palette-search", image: "shell-palette-02-search.png" },
    "palette-no-results": { ref: [OPEN, NONE], oc: [OPEN, NONE], uiMap: "palette-no-results", image: "shell-palette-03-no-results.png" },
  };
};
