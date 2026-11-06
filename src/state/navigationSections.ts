// User sidebar sections ("navigation sections"), after Conductor v0.87.6.
//
// Conductor's local backend (renderApp `WIr`) reads the whole layout from
// conductor.db, applies one pure edit to it and writes the whole layout back
// with `updatedAt = max(now, previous + 1)` (`tve`). The edits live in the
// index chunk (index-BGEQ8YjU.js, REA-decoded, read as data):
//   create `_Y`, edit `SY`, delete `wY`, reorder `bY`, assign `yY`,
//   unassign `kY`, and `V2`, which takes a workspace out of every section.
// The sidebar projection is renderApp `usa`: a workspace belongs to the first
// section that lists it, archived workspaces and hidden repositories are left
// out, and a section's rows are ordered newest activity first.

export interface NavSection {
  id: string;
  name: string;
  emoji?: string;
  /** Members in membership order (the order they were added). */
  workspaceIds: string[];
}

/** `V2`: the layout with `workspaceId` removed from every section. */
export function withoutWorkspace(sections: readonly NavSection[], workspaceId: string): NavSection[] {
  return sections.map((s) => (s.workspaceIds.includes(workspaceId) ? { ...s, workspaceIds: s.workspaceIds.filter((id) => id !== workspaceId) } : s));
}

/**
 * `_Y`: add `section` before `beforeSectionId` (at the end without one). Its
 * members leave whatever section held them. Unchanged when `beforeSectionId`
 * names no section (Conductor throws "Section not found").
 */
export function createSection(sections: readonly NavSection[], section: NavSection, beforeSectionId?: string): NavSection[] {
  const rest = section.workspaceIds.reduce<NavSection[]>((list, id) => withoutWorkspace(list, id), [...sections]).filter((s) => s.id !== section.id);
  const at = beforeSectionId === undefined ? rest.length : rest.findIndex((s) => s.id === beforeSectionId);
  if (at === -1) return [...sections];
  rest.splice(at, 0, section);
  return rest;
}

/**
 * `SY`: rename a section and set its emoji. As in Conductor's local backend,
 * an edit without an emoji keeps the one the section had (the edit is spread
 * over the stored section), so the dialog's "remove emoji" does not clear a
 * stored emoji on a local organization.
 */
export function editSection(sections: readonly NavSection[], edit: { id: string; name: string; emoji?: string }): NavSection[] {
  return sections.map((s) => (s.id === edit.id ? { ...s, name: edit.name, ...(edit.emoji === undefined ? {} : { emoji: edit.emoji }) } : s));
}

/** `wY`: drop the section; its workspaces go back to their repository groups. */
export function deleteSection(sections: readonly NavSection[], sectionId: string): NavSection[] {
  return sections.filter((s) => s.id !== sectionId);
}

/** `bY`: move a section to `toIndex` (an index into the list without it). */
export function reorderSection(sections: readonly NavSection[], sectionId: string, toIndex: number): NavSection[] {
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return [...sections];
  const rest = sections.filter((s) => s.id !== sectionId);
  rest.splice(toIndex, 0, section);
  return rest;
}

/**
 * `yY` (with a section) and `kY` (with null): put the workspace at the end of
 * `sectionId`, or out of every section. Unchanged when the section is gone.
 */
export function assignWorkspace(sections: readonly NavSection[], workspaceId: string, sectionId: string | null): NavSection[] {
  if (sectionId === null) return withoutWorkspace(sections, workspaceId);
  if (!sections.some((s) => s.id === sectionId)) return [...sections];
  return withoutWorkspace(sections, workspaceId).map((s) => (s.id === sectionId ? { ...s, workspaceIds: [...s.workspaceIds, workspaceId] } : s));
}

/** The section that holds `workspaceId` (the first, as the projection reads it). */
export function sectionOf(sections: readonly NavSection[] | undefined, workspaceId: string): NavSection | undefined {
  return sections?.find((s) => s.workspaceIds.includes(workspaceId));
}

/** `tve`'s stamp for a write after one stamped `previous`. */
export function nextUpdatedAt(previous: number | undefined, now = Date.now()): number {
  return Math.max(now, (previous ?? 0) + 1);
}

export interface ProjectionWorkspace {
  id: string;
  /** Sort key: newest first. */
  updatedAt: number;
  /** Archived, or its repository is not listed: never shown in a section. */
  listed: boolean;
}

export interface SectionProjection<W extends ProjectionWorkspace> {
  sections: { section: NavSection; workspaces: W[] }[];
  /** Every workspace shown in a section; they leave Pinned and their repository group. */
  sectioned: Set<string>;
}

/** `usa`: each section with the listed workspaces it holds, newest first. */
export function projectSections<W extends ProjectionWorkspace>(sections: readonly NavSection[] | undefined, workspaces: readonly W[]): SectionProjection<W> {
  const groups = (sections ?? []).map((section) => ({ section, workspaces: [] as W[] }));
  const owner = new Map<string, (typeof groups)[number]>();
  for (const g of groups) for (const id of g.section.workspaceIds) if (!owner.has(id)) owner.set(id, g);
  const sectioned = new Set<string>();
  for (const w of [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const g = owner.get(w.id);
    if (!w.listed || !g) continue;
    g.workspaces.push(w);
    sectioned.add(w.id);
  }
  return { sections: groups, sectioned };
}

/** A section as `db_read_navigation_sections` returns it (sidebar_section_commands.rs). */
export interface DbNavSection {
  id: string;
  name: string;
  emoji: string | null;
  workspaceIds: string[];
}

export function sectionsFromDb(rows: readonly DbNavSection[]): NavSection[] {
  return rows.map((r) => ({ id: r.id, name: r.name, ...(r.emoji === null ? {} : { emoji: r.emoji }), workspaceIds: [...r.workspaceIds] }));
}

// ------------------------------------------------------------- drag and drop
//
// Conductor's pointer drag controller `esa` (renderApp-D_fmY7hW.js
// @10091000-10096500, phase store `vm` @9936000-9939500; REA-decoded, read as
// data): a dragged row drops on a section, on Pinned or on My workspaces
// (`H`), and a drop that would leave it where it is is no target (`P`). A
// dragged section header reorders the sections (`D`, `U`), the insertion
// index coming from the section midpoints under the pointer (`Zra`). Rows
// inside a section stay newest first (`usa`), so a section has no manual row
// order to drag.

export type DropTarget =
  | { type: "section"; sectionId: string }
  | { type: "pinned" }
  | { type: "unsectioned" }
  | { type: "reorder"; insertionIndex: number };

export type DropAction = { kind: "assign"; sectionId: string } | { kind: "pin" } | { kind: "unpin" } | { kind: "unassign" };

/** Drop-zone attributes the hit test reads (`eYe`, `aJn`, `iOt`, `rOt`). */
export const DROP_ATTR = {
  section: "data-navigation-section-drop-id",
  sections: "data-navigation-sections-section",
  pinned: "data-workspace-pinned-drop",
  unsectioned: "data-workspace-unsectioned-drop",
} as const;

/** Pixels a press moves before it becomes a drag (`qra`). */
export const DRAG_THRESHOLD_PX = 5;

/** `P`: no target when the drop would leave the row where it already is. */
export function workspaceDropTarget(sections: readonly NavSection[], workspaceId: string, pinned: boolean, hit: DropTarget | undefined): DropTarget | undefined {
  const current = sectionOf(sections, workspaceId)?.id;
  const stays =
    hit?.type === "section" ? current === hit.sectionId : hit?.type === "pinned" ? pinned && current === undefined : hit?.type === "unsectioned" ? !pinned && current === undefined : false;
  return stays ? undefined : hit;
}

/**
 * `H`: what a row's drop does. On a section it moves there; on Pinned it pins
 * (the pin takes it out of its section); on My workspaces it unpins a pinned
 * row outside any section and otherwise takes the row out of its section.
 */
export function workspaceDropAction(sections: readonly NavSection[], workspaceId: string, pinned: boolean, target: DropTarget | undefined): DropAction | undefined {
  if (target === undefined || target.type === "reorder") return undefined;
  if (workspaceDropTarget(sections, workspaceId, pinned, target) === undefined) return undefined;
  if (target.type === "section") return { kind: "assign", sectionId: target.sectionId };
  if (target.type === "pinned") return { kind: "pin" };
  return pinned && sectionOf(sections, workspaceId) === undefined ? { kind: "unpin" } : { kind: "unassign" };
}

/**
 * `R`: a press on a row becomes a drag only when some drop could move it:
 * there are sections, it is in one, or a Pinned / My workspaces zone it is
 * not already in is on screen.
 */
export function canDragWorkspace(sections: readonly NavSection[], workspaceId: string, pinned: boolean, zones: { pinned: boolean; unsectioned: boolean }): boolean {
  const sectioned = sectionOf(sections, workspaceId) !== undefined;
  const toPinned = (!pinned || sectioned) && zones.pinned;
  const toUnsectioned = (pinned || sectioned) && zones.unsectioned;
  return sections.length > 0 || sectioned || toPinned || toUnsectioned;
}

/** `O`: sections reorder only when there are at least two. */
export function canDragSection(sections: readonly NavSection[], sectionId: string): boolean {
  return sections.length > 1 && sections.some((s) => s.id === sectionId);
}

/**
 * `Zra`: the insertion index for pointer height `y`: before the first section
 * whose vertical midpoint is below `y`, else after the last; `undefined` when
 * a section has no rectangle on screen.
 */
export function insertionIndexAt(y: number, sections: readonly NavSection[], rects: ReadonlyMap<string, { top: number; height: number }>): number | undefined {
  for (const [i, s] of sections.entries()) {
    const r = rects.get(s.id);
    if (r === undefined) return undefined;
    if (y < r.top + r.height / 2) return i;
  }
  return sections.length;
}

/** `D`: an insertion index just above or below the dragged section is no move. */
export function reorderTarget(sections: readonly NavSection[], sectionId: string, insertionIndex: number | undefined): DropTarget | undefined {
  if (insertionIndex === undefined) return undefined;
  const at = sections.findIndex((s) => s.id === sectionId);
  return insertionIndex === at || insertionIndex === at + 1 ? undefined : { type: "reorder", insertionIndex };
}

/** `U`: the `toIndex` for `reorderSection`, or `undefined` when nothing moves. */
export function reorderToIndex(sections: readonly NavSection[], sectionId: string, target: DropTarget | undefined): number | undefined {
  if (target?.type !== "reorder") return undefined;
  const at = sections.findIndex((s) => s.id === sectionId);
  if (at === -1) return undefined;
  const to = target.insertionIndex > at ? target.insertionIndex - 1 : target.insertionIndex;
  return to === at ? undefined : to;
}

/** `Iea`: where a section draws the reorder line: above it, or below the last section. */
export function reorderIndicator(target: DropTarget | undefined, sectionIndex: number, isLast: boolean): "above" | "below" | undefined {
  if (target?.type !== "reorder") return undefined;
  if (target.insertionIndex === sectionIndex) return "above";
  if (isLast && target.insertionIndex === sectionIndex + 1) return "below";
  return undefined;
}
