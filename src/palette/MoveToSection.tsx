import { ConductorIcon } from "../components/ConductorIcon";
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
 * Build the flat item list for a given query.
 * With a query: only show name-matching sections (no New/Remove footer rows).
 * Without a query: all sections, then "New section…", then "Remove from section"
 * if the workspace is currently in a section.
 */
export function sectionItems(
  sections: readonly NavSection[],
  workspaceId: string,
  query: string,
): SectionItem[] {
  const q = query.toLowerCase();
  const filtered = q
    ? sections.filter((s) => s.name.toLowerCase().includes(q))
    : sections;
  if (q) return filtered.map((s): SectionItem => ({ kind: "section", section: s }));
  const inSection = sections.some((s) => s.workspaceIds.includes(workspaceId));
  return [
    ...filtered.map((s): SectionItem => ({ kind: "section", section: s })),
    { kind: "new" },
    ...(inSection ? [{ kind: "remove" } as SectionItem] : []),
  ];
}

interface RenderProps {
  workspaceId: string;
  sections: readonly NavSection[];
  query: string;
  active: number;
  onActive: (index: number) => void;
  onSelectAt: (index: number) => void;
  onBack: () => void;
}

export function MoveToSection({
  workspaceId, sections, query, active, onActive, onSelectAt, onBack,
}: RenderProps) {
  const currentSectionId =
    sections.find((s) => s.workspaceIds.includes(workspaceId))?.id ?? null;
  const items = sectionItems(sections, workspaceId, query);
  const sectionCount = items.filter((item) => item.kind === "section").length;

  return (
    <div className="palette-move-section-wrapper">
      <button
        className="palette-section-back-btn"
        aria-label="Back to commands"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onBack}
      >
        <ConductorIcon name="arrow-left" size={14} />
        <span>Commands</span>
      </button>
      <div className="palette-list" id="palette-list" role="listbox">
        {items.map((item, i) => {
          if (item.kind === "section") {
            const isCurrent = item.section.id === currentSectionId;
            return (
              <div
                key={item.section.id}
                role="option"
                aria-selected={i === active}
                aria-disabled={isCurrent || undefined}
                className={[
                  "palette-item",
                  i === active && !isCurrent ? "active" : "",
                ].filter(Boolean).join(" ")}
                onMouseMove={() => { if (!isCurrent && i !== active) onActive(i); }}
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
              {isFirstFooter && sectionCount > 0 && <hr role="separator" />}
              <div
                role="option"
                aria-selected={i === active}
                className={i === active ? "palette-item active" : "palette-item"}
                onMouseMove={() => { if (i !== active) onActive(i); }}
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
