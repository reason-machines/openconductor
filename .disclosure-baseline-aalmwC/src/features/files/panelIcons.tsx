// Right-panel icons (All files tree, its toolbar, the Setup / Run / Terminal
// strip), drawn from the shared Conductor icon set (Lucide 0.577.0, stroke 2).
import { ConductorIcon } from "../../components/ConductorIcon";
import type { ConductorIconName } from "../../components/conductorIcons.generated";

const icon = (name: ConductorIconName) =>
  function Icon({ size = 14 }: { size?: number }) {
    return <ConductorIcon name={name} size={size} />;
  };

export const FolderClosedIcon = icon("folder");
export const FolderOpenIcon = icon("folder-open");
export const ChevronRightIcon = icon("chevron-right");
export const ChevronDownIcon = icon("chevron-down");
export const SearchIcon = icon("search");
export const FilePlusIcon = icon("file-plus");
/** Collapse all folders (Lucide "chevrons-down-up"). */
export const CollapseAllIcon = icon("chevrons-down-up");
export const PlusIcon = icon("plus");
export const XIcon = icon("x");
export const EraserIcon = icon("eraser");
