/**
 * SoundSelect — custom grouped select for the completion sound row.
 *
 * Matches Conductor's `rga`/`sga`/`iga` chain (renderApp-D_fmY7hW.js,
 * offsets 10706171–10706767 / 10659440) using Base UI Select instead of
 * Radix Select. Group headers show transit logos via CSS mask-image exactly
 * as Conductor's `iga` function: `maskImage: url(logo.path)`, right-center,
 * no-repeat, contain, over `bg-muted-foreground` (--muted).
 *
 * Native HTML <select>/<optgroup> cannot render logo content in group
 * headers; this component is the minimum required for logo parity.
 */
import { Select } from "@base-ui/react/select";
import type { CSSProperties } from "react";
import { GROUP_LOGOS, SOUND_OPTIONS } from "./sound";
import type { SoundType } from "./sound";

/** Build the same grouped structure as Conductor's `E8t()` function. */
function buildGroups(): Array<{ label: string; sounds: Array<{ value: string; label: string; group: string }> }> {
  const groups: Array<{ label: string; sounds: Array<{ value: string; label: string; group: string }> }> = [];
  for (const opt of SOUND_OPTIONS) {
    const last = groups[groups.length - 1];
    if (last && last.label === opt.group) {
      last.sounds.push(opt);
    } else {
      groups.push({ label: opt.group, sounds: [opt] });
    }
  }
  return groups;
}

const GROUPS = buildGroups();

/**
 * Matches Conductor's `iga({label, logo})`:
 * - With logo: flex row with text label + masked SVG icon flush right.
 * - Without logo: label text as fragment.
 *
 * REA-exact CSS: maskImage url(path), maskPosition "right center",
 * maskRepeat "no-repeat", maskSize "contain" over block h-4 w-8 shrink-0
 * bg-muted-foreground.
 */
function GroupLogoHeader({ groupLabel }: { groupLabel: string }) {
  const logo = GROUP_LOGOS[groupLabel];
  if (!logo) return <>{groupLabel}</>;
  const maskStyle: CSSProperties = {
    maskImage: `url('${logo.path}')`,
    maskPosition: "right center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
    WebkitMaskImage: `url('${logo.path}')`,
    WebkitMaskPosition: "right center",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
  };
  return (
    <span className="ss-group-label-inner">
      <span>{groupLabel}</span>
      {/* REA iga: block h-4 w-8 shrink-0 bg-muted-foreground + mask-image */}
      <span aria-label={logo.label} className="ss-group-logo" style={maskStyle} />
    </span>
  );
}

export function SoundSelect({
  value,
  onChange,
  disabled,
}: {
  value: SoundType;
  onChange: (v: SoundType) => void;
  disabled?: boolean;
}) {
  const selectedLabel = SOUND_OPTIONS.find((o) => o.value === value)?.label ?? value;

  return (
    <Select.Root value={value} onValueChange={(v: unknown) => onChange(v as SoundType)} disabled={disabled}>
      <Select.Trigger className="ss-trigger" aria-label="Completion sound">
        <span className="ss-trigger-value">{selectedLabel}</span>
        {/* Matches the arrow-down icon in settings-select */}
        <span className="ss-trigger-icon" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
          </svg>
        </span>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="ss-positioner" sideOffset={4}>
          <Select.Popup className="ss-popup">
            {GROUPS.map((group) => (
              <Select.Group key={group.label || "_ungrouped"}>
                {group.label && (
                  <Select.GroupLabel className="ss-group-label">
                    <GroupLogoHeader groupLabel={group.label} />
                  </Select.GroupLabel>
                )}
                {group.sounds.map((opt) => (
                  <Select.Item key={opt.value} value={opt.value} className="ss-item">
                    <Select.ItemText>{opt.label}</Select.ItemText>
                    <Select.ItemIndicator className="ss-item-check">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Group>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
