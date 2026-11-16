import { Fragment } from "react";
import type { SentUserContentV1 } from "./userContent.ts";
import { sentFileTarget } from "./userContent.ts";
import { UserText } from "./UserText.tsx";

interface Props {
  content: SentUserContentV1;
  workspacePath?: string;
  onOpenFile?: (path: string) => void;
}

export function SentUserContent({ content, workspacePath, onOpenFile }: Props) {
  const chip = (label: string, path: string, target: string | null) => target && onOpenFile
    ? <button type="button" className="oc-sent-file-chip" title={path} onClick={() => onOpenFile(target)}>{label}</button>
    : <span className="oc-sent-file-chip" title={path}>{label}</span>;
  return (
    <>
      {content.parts.map((part, index) => <Fragment key={index}>{part.kind === "text" ? <UserText text={part.text} /> : chip(part.label, part.path, sentFileTarget(workspacePath, part))}</Fragment>)}
      {content.attachments.map((attachment, index) => (
        <Fragment key={`attachment:${index}`}>
          {"\n\n"}
          {attachment.kind === "workspace-file"
            ? chip(attachment.label, attachment.path, sentFileTarget(workspacePath, attachment))
            : `Attached: ${attachment.name}`}
        </Fragment>
      ))}
    </>
  );
}
