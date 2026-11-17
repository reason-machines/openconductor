import { useEffect, useRef } from "react";
import { ConductorIcon } from "../components/ConductorIcon";
import { filterScore } from "./search/score.ts";
import type { NavSection } from "../state/navigationSections";

export interface MoveToSectionProps {
  workspaceId: string;
  sections: readonly NavSection[];
  onMove: (sectionId: string | null) => void;
  onNewSection: () => void;
  onBack: () => void;
}

/** Item model for the section picker list. */
export type SectionItem =
  | { kind: "section"; section: NavSection }
  | { kind: "new" }
  | { kind: "remove" };

/**
 * Sections and footer commands share Conductor's value/keyword filter.
 * Search ranks items within their groups, then groups by their best match.
 * Empty search preserves the original sections, New, Remove order.
 */
export function sectionItems(
  sections: readonly NavSection[],
  workspaceId: string,
  query: string,
): SectionItem[] {
  const currentSectionId = sections.find((s) => s.workspaceIds.includes(workspaceId))?.id;
  const groups: SectionItem[][] = [
    sections.map((section) => ({ kind: "section", section })),
    [{ kind: "new" }, ...(currentSectionId !== undefined ? [{ kind: "remove" } as SectionItem] : [])],
  ];
  if (!query) return groups.flat();
  return groups.map((items) => items.map((item) => ({
    item,
    disabled: item.kind === "section" && item.section.id === currentSectionId,
    score: item.kind === "section"
      ? filterScore(item.section.id, query, [item.section.name])
      : item.kind === "new"
        ? filterScore("new-section", query, ["create", "new", "section"])
        : filterScore("remove-from-section", query, ["remove", "from", "section"]),
  })).filter(({ score }) => score > 0).sort((a, b) => Number(b.disabled) - Number(a.disabled) || b.score - a.score))
    .sort((a, b) => Math.max(0, ...b.map(({ score }) => score)) - Math.max(0, ...a.map(({ score }) => score)))
    .flatMap((items) => items.map(({ item }) => item));
}

interface RenderProps {
  workspaceId: string;
  sections: readonly NavSection[];
  query: string;
  active: number;
  optionId?: (index: number) => string;
  onActive: (index: number) => void;
  onSelectAt: (index: number) => void;
  onBack: () => void;
}

export function MoveToSection({
  workspaceId, sections, query, active, optionId, onActive, onSelectAt, onBack,
}: RenderProps) {
  const currentSectionId =
    sections.find((s) => s.workspaceIds.includes(workspaceId))?.id ?? null;
  const items = sectionItems(sections, workspaceId, query);
  const sectionCount = items.filter((item) => item.kind === "section").length;
  const listRef = useRef<HTMLDivElement>(null);
  const pointerSelection = useRef(false);
  const selected = items[active];
  const selectedKey = selected?.kind === "section" ? selected.section.id : selected?.kind;
  useEffect(() => {
    if (!pointerSelection.current) {
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }
    pointerSelection.current = false;
  }, [selectedKey]);
  function selectFromPointer(index: number) {
    if (index === active) return;
    pointerSelection.current = true;
    onActive(index);
  }

  return (
    <div className="palette-move-section-wrapper">
      <div className="palette-move-section-header">
        <button
          className="palette-section-back-btn"
          aria-label="Back to commands"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onBack}
        >
          <ConductorIcon name="arrow-left" size={14} />
        </button>
        <span className="palette-section-title">Move to section</span>
      </div>
      <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
        {query.length > 0 && items.length === 0 && (
          <div className="palette-section-empty">No matching sections</div>
        )}
        {items.map((item, i) => {
          if (item.kind === "section") {
            const isCurrent = item.section.id === currentSectionId;
            return (
              <div
                key={item.section.id}
                id={optionId?.(i)}
                role="option"
                aria-selected={i === active}
                aria-disabled={isCurrent || undefined}
                className={[
                  "palette-item",
                  i === active && !isCurrent ? "active" : "",
                ].filter(Boolean).join(" ")}
                onMouseMove={() => { if (!isCurrent) selectFromPointer(i); }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { if (!isCurrent) onSelectAt(i); }}
              >
                <span
                  className="palette-icon"
                  aria-label={isCurrent ? "Current section" : undefined}
                  aria-hidden={isCurrent ? undefined : true}
                >
                  {isCurrent && <ConductorIcon name="check" size={14} />}
                </span>
                <span className="palette-title">{item.section.name}</span>
              </div>
            );
          }

          /* Separator before the first footer row (only when at least one section shown). */
          const isFirstFooter = i === sectionCount;
          return (
            <div key={item.kind} className="palette-section-footer-row">
              {!query && isFirstFooter && sectionCount > 0 && <hr role="separator" />}
              <div
                id={optionId?.(i)}
                role="option"
                aria-selected={i === active}
                className={i === active ? "palette-item active" : "palette-item"}
                onMouseMove={() => selectFromPointer(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelectAt(i)}
              >
                <span className="palette-title">
                  {item.kind === "new" ? "New section\u2026" : "Remove from section"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
