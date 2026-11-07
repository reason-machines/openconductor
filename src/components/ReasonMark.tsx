import { useId } from "react";
import mark from "../assets/reason-agent-mark/reason-mark-mask.svg?raw";

export function ReasonMark({ size = 14, className }: { size?: number; className?: string }) {
  const maskId = `reason-eyes-${useId().replace(/:/g, "")}`;
  const contents = mark.slice(mark.indexOf(">") + 1, mark.lastIndexOf("</svg>"))
    .replaceAll('id="eyes"', `id="${maskId}"`)
    .replaceAll("url(#eyes)", `url(#${maskId})`);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 100 100"
      fill="currentColor" stroke="none" aria-hidden="true" data-agent="reason" className={className}
      dangerouslySetInnerHTML={{ __html: contents }} />
  );
}
