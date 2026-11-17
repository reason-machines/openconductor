import { Select } from "@base-ui/react/select";
import { ARCHIVE_FILTERS, ARCHIVE_FILTER_LABELS, type ArchiveFilter as ArchiveFilterValue } from "../../home/allWorkspaces";
import { ArchiveIcon, ChevronDownIcon } from "../Icons";

const OPTIONS = ARCHIVE_FILTERS.map((value) => ({ value, label: ARCHIVE_FILTER_LABELS[value] }));

/** Home's archive filter is a single Select (Conductor's nFi → ah), not the Projects checkbox menu. */
export function ArchiveFilter({ value, onChange }: { value: ArchiveFilterValue; onChange: (value: ArchiveFilterValue) => void }) {
  return (
    <Select.Root items={OPTIONS} value={value} onValueChange={(next) => { if (next !== null) onChange(next); }}>
      <Select.Trigger className="allws-filter allws-archive-filter" aria-label="Archived workspaces">
        <ArchiveIcon size={14} />
        <span className="allws-filter-label">{ARCHIVE_FILTER_LABELS[value]}</span>
        <ChevronDownIcon size={12} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="allws-archive-positioner" align="end" sideOffset={4} alignItemWithTrigger={false}>
          <Select.Popup className="allws-menu-pop allws-archive-popup">
            {OPTIONS.map((option) => (
              <Select.Item key={option.value} value={option.value} className="allws-menu-item">
                <span className="allws-check" aria-hidden><Select.ItemIndicator>✓</Select.ItemIndicator></span>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
