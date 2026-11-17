// An empty workspace chat, as Conductor shows it (chatEmptyState.ts has the rules
// and the bundle references): the workspace's first chat gets "You’re in a new
// copy of <repo> called <dir>" and its steps; a later chat gets "New chat in
// /<dir>." and chips that attach another chat's transcript.

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { BranchIcon, FolderIcon } from "../../components/Icons";
import { ModelGlyph } from "./composerIcons.tsx";
import { emptyState, type OtherChat } from "./chatEmptyState.ts";
import "./chatEmptyState.css";

export interface ChatEmptyStateProps {
  repoName: string;
  directoryName: string;
  /** `workspaces.state`. */
  state?: string;
  branch: string;
  /** Where the branch came from ("origin/main"), when known. */
  branchedFrom?: string | null;
  otherChats: readonly OtherChat[];
  onAttachTranscript: (chat: OtherChat) => void;
}

export function ChatEmptyState({ repoName, directoryName, state, branch, branchedFrom, otherChats, onAttachTranscript }: ChatEmptyStateProps) {
  const view = emptyState(otherChats, state);
  if (view.kind === "none") return null;
  if (view.kind === "first") {
    return (
      <div className="oc-chat-empty">
        <div className="oc-first-chat">
          <div className="oc-first-chat-box">
            <h3>
              You’re in a new copy of <span className="oc-mono">{repoName}</span> called <span className="oc-mono">{directoryName}</span>
            </h3>
          </div>
          {view.steps ? (
            <ul className="oc-first-chat-steps">
              {branchedFrom ? (
                <li className="oc-first-chat-step">
                  <BranchIcon size={14} />
                  <span>
                    Branched <span className="oc-mono">{branch}</span> from <span className="oc-mono">{branchedFrom}</span>
                  </span>
                </li>
              ) : null}
              <li className="oc-first-chat-step">
                <FolderIcon size={14} />
                <span>
                  Created <span className="oc-mono">{directoryName}</span>
                </span>
              </li>
            </ul>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="oc-chat-empty">
      <div className="oc-new-chat">
        <p>
          New chat in <span className="oc-mono">/{directoryName}</span>.
        </p>
        <div className="oc-new-chat-group">
          <p>Add chat transcripts:</p>
          <div className="oc-new-chat-chips">
            {view.transcripts.map((c) => (
              <TranscriptChip key={c.chatId} chat={c} onAttach={onAttachTranscript} />
            ))}
            {view.overflow.length > 0 ? <MoreChats chats={view.overflow} onAttach={onAttachTranscript} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function TranscriptChip({ chat, onAttach }: { chat: OtherChat; onAttach: (c: OtherChat) => void }) {
  return (
    <button type="button" className="oc-transcript-chip" title={chat.title} onClick={() => onAttach(chat)}>
      <ModelGlyph model={chat.agent === "codex" ? "gpt-" : "opus"} agent={chat.agent} />
      <span>{chat.title}</span>
    </button>
  );
}

function MoreChats({ chats, onAttach }: { chats: readonly OtherChat[]; onAttach: (c: OtherChat) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="oc-transcript-chip oc-transcript-more">
        +{chats.length} more
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="oc-transcript-overflow-positioner" side="bottom" align="start" sideOffset={4}>
          <Popover.Popup className="oc-transcript-overflow-popup" aria-label="More chat transcripts">
            <div className="oc-transcript-overflow-list">
              {chats.map((c) => (
                <TranscriptChip key={c.chatId} chat={c} onAttach={onAttach} />
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
