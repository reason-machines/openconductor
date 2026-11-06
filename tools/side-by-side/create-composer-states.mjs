// Create workspace composer states for tools/side-by-side/help-diagnostics.mjs:
//
//   npm run build && SBS_STATES=tools/side-by-side/create-composer-states.mjs \
//     DIST_REF=.rea-work/dist VIEWPORT=1280x820 TMPDIR=/tmp/t REA=<rea> \
//     [UIMAP_RECORD=parity/ui-map/side-by-side.json] \
//     node tools/side-by-side/help-diagnostics.mjs <out-dir> [state ...]
//
// Both sides open the create dialog from the sidebar's Create row (Conductor's
// `pya` dialog around the `ZQo` repo picker, `U4a` target branch and the
// create-from trigger), then open the repo list, its Add project menu, or the
// Target branch popover. Conductor's harness opens the dialog with no repo
// chosen, so its trigger says "Select repo"; OpenConductor's opens on the first
// repo, as Conductor's `q4a` does once its repositories have loaded. States
// with uiMap null are captured but not recorded (the UI map has no such state).
export default ({ css }) => {
  const REF_CREATE = css("text=Create >> nth=0");
  const OC_CREATE = css(".sb-primary .sb-row >> text=Create");
  const REF_REPO = css("text=Select repo");
  const OC_REPO = css(".create-repo-trigger");
  const BRANCH = css("[aria-label='Target branch'] >> nth=0");
  // Conductor's repo list is a Base UI Select (items are role=option); ours is a menu.
  const ADD = css("text=Add project >> nth=-1");
  return {
    create: { ref: [REF_CREATE], oc: [OC_CREATE], uiMap: "create", image: "create-composer-01-dialog.png" },
    "create-repo-picker": { ref: [REF_CREATE, REF_REPO], oc: [OC_CREATE, OC_REPO], uiMap: "create-repo-picker", image: "create-composer-02-repo-picker.png" },
    "create-add-project": { ref: [REF_CREATE, REF_REPO, ADD], oc: [OC_CREATE, OC_REPO, ADD], uiMap: null, image: "create-composer-03-add-project.png" },
    "create-target-branch": { ref: [REF_CREATE, BRANCH], oc: [OC_CREATE, BRANCH], uiMap: null, image: "create-composer-04-target-branch.png" },
  };
};
