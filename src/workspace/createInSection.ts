// Create a workspace directly inside a sidebar section (parity.create.in-section).
// Conductor 0.87.6, renderApp-D_fmY7hW.js (sha256 5199d392...):
// - the section menu's first item is "Create workspace" (oBi @10,005,110), which
//   opens the new-workspace composer with that section's id (g5({sectionId, repositoryId}));
// - the composer (Hji @9,725,170) labels its Create button `Create in ${name}` for that
//   section (sQo label), and with no section chosen and at least one section it splits
//   the button with a "Create in section" menu listing every section, emoji then name
//   (iQo @9,711,015; shown when !onStart && no preselected section && sections.length > 0);
// - creating with a section id that is no longer a section does nothing (la @9,729,192);
// - after the create, the new workspace is assigned to the section and unpinned
//   (GCi -> assignPendingWorkspace, index chunk @3,244,742); if that fails it toasts
//   SECTION_ASSIGN_FAILED and keeps the workspace.
import type { NavSection } from "../state/navigationSections.ts";

export const CREATE_IN_SECTION = "Create in section";
export const SECTION_ASSIGN_FAILED = "Workspace created, but couldn't add it to the section. Move it from the sidebar.";

export interface SectionChoice {
  /** The Create button's label. */
  label: string;
  /** The preselected section the default Create targets, if any. */
  sectionId: string | undefined;
  /** Sections for the split button's "Create in section" menu; undefined hides it. */
  menu: readonly NavSection[] | undefined;
}

export function sectionChoice(sections: readonly NavSection[], preselectedId: string | undefined): SectionChoice {
  const preselected = preselectedId === undefined ? undefined : sections.find((s) => s.id === preselectedId);
  return {
    label: preselected ? `Create in ${preselected.name}` : "Create",
    sectionId: preselected?.id,
    menu: preselected === undefined && sections.length > 0 ? sections : undefined,
  };
}

/** Whether a create aimed at `sectionId` may go ahead: no section, or one that still exists. */
export function canCreateIn(sections: readonly NavSection[], sectionId: string | undefined): boolean {
  return sectionId === undefined || sections.some((s) => s.id === sectionId);
}
