import type { CSSProperties } from "react";
import { CONDUCTOR_ICONS, type ConductorIconName } from "./conductorIcons.generated";

/** One shared Conductor icon (Lucide geometry, 24x24) at `size` px, stroked in the current colour. */
export function ConductorIcon({ name, size = 16, strokeWidth = 2, style }: { name: ConductorIconName; size?: number; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={style}>
      {CONDUCTOR_ICONS[name].map(([tag, attrs], i) => {
        const Tag = tag as "path";
        return <Tag key={i} {...attrs} />;
      })}
    </svg>
  );
}
