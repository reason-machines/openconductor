import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { ComposerEditorHandle, ComposerSelection } from "../../features/chat/ComposerEditor.tsx";
import { FileMentionMenu } from "../../features/chat/FileMentionMenu.tsx";
import { SlashMenu } from "../../features/chat/SlashMenu.tsx";
import { fileMentionQuery, mentionItems, type MentionItem } from "../../features/chat/fileMentions.ts";
import { composerSlashRange, matchCommands, skillCommand, type SlashCommand, type ComposerAgent } from "../../features/chat/slashCommands.ts";
import { completionIdentityKey, searchPreWorkspaceFiles, usePreWorkspaceCompletions, type CompletionIdentity } from "../../features/chat/preWorkspaceCompletions.ts";
import type { FileMatch } from "../../spotlight/quickOpen.ts";

interface Options {
  identity: CompletionIdentity | null;
  inputRef: RefObject<ComposerEditorHandle>;
  disabled: boolean;
}

/** Pre-workspace menus only: no workspace actions, agent calls or submit handlers. */
export function useCreateWorkspaceSuggestions({ identity, inputRef, disabled }: Options) {
  const state = usePreWorkspaceCompletions(identity);
  const data = state?.status === "ready" ? state.data : null;
  const identityKey = identity ? completionIdentityKey(identity) : "";
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState<ComposerSelection>({ text: "", start: 0, end: 0 });
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashIndex, setSlashIndex] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const mention = focused && !disabled && identity ? fileMentionQuery(selection.text, selection.start, selection.end) : null;
  const slash = focused && !disabled && identity ? composerSlashRange(selection.text, selection.start, selection.end) : null;
  const mentionKey = mention ? JSON.stringify([identityKey, "@", mention.start, mention.end, mention.query]) : null;
  const slashKey = slash ? JSON.stringify([identityKey, "/", slash.start, slash.end, slash.query]) : null;
  const [files, setFiles] = useState<{ key: string; data: typeof data; matches: FileMatch[] } | null>(null);
  useEffect(() => {
    if (!data || !mention || mentionKey === dismissed) return;
    let live = true;
    void searchPreWorkspaceFiles(data.files, mention.query).then(
      (matches) => { if (live) setFiles({ key: mentionKey!, data, matches }); },
      () => { if (live) setFiles(null); },
    );
    return () => { live = false; };
  }, [data, mentionKey, dismissed]);
  useLayoutEffect(() => { setMentionIndex(0); }, [mentionKey]);
  useLayoutEffect(() => { setSlashIndex(0); }, [slashKey]);
  const mentionMatches = mentionKey !== null && mentionKey !== dismissed && files?.key === mentionKey && files.data === data
    ? mentionItems(mention?.query ?? "", files.matches, false) : [];
  const commands = useMemo((): SlashCommand[] => {
    if (!data || !identity) return [];
    const agent: ComposerAgent = identity.agentType === "reason" ? "acp" : identity.agentType as ComposerAgent;
    return [
      ...data.slashCommands.map((command): SlashCommand => ({ ...command, argumentHint: command.argumentHint ?? "", effect: "agent", supportedAgents: [agent] })),
      ...data.skills.map((skill) => skillCommand(skill, agent)),
    ];
  }, [data, identityKey]);
  const slashMatches = slash && slashKey !== dismissed ? matchCommands(commands, slash.query) : [];
  const mentionFocus = Math.min(mentionIndex, Math.max(0, mentionMatches.length - 1));
  const slashFocus = Math.min(slashIndex, Math.max(0, slashMatches.length - 1));

  function pickMention(item: MentionItem) {
    const box = inputRef.current;
    if (!box || disabled || box.composing() || item.kind !== "file") return;
    const current = box.selection();
    const range = fileMentionQuery(current.text, current.start, current.end);
    if (!range || !mention || range.start !== mention.start || range.end !== mention.end || range.query !== mention.query) return;
    const file = item.match;
    box.insertFile(range, { path: file.relative_path, label: file.relative_path, directory: file.file.is_directory });
    setDismissed(mentionKey);
  }
  function pickCommand(command: SlashCommand) {
    const box = inputRef.current;
    if (!box || disabled || box.composing() || !slash) return;
    const current = box.selection();
    const range = composerSlashRange(current.text, current.start, current.end);
    if (!range || range.start !== slash.start || range.end !== slash.end || range.query !== slash.query) return;
    // Reuse OpenConductor's existing Codex skill-link grammar; this is not
    // a claim that Conductor's section-sign skill atom is reproduced here.
    if (box.replaceRange(range, `${command.insert ?? `/${command.name}`} `)) setDismissed(slashKey);
  }
  function onKeyDown(event: KeyboardEvent): boolean {
    if (disabled || event.isComposing || event.keyCode === 229 || inputRef.current?.composing()) return false;
    const isMention = mentionMatches.length > 0;
    const count = isMention ? mentionMatches.length : slashMatches.length;
    if (!count || !["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return false;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "Escape") setDismissed(isMention ? mentionKey : slashKey);
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const current = isMention ? mentionFocus : slashFocus;
      (isMention ? setMentionIndex : setSlashIndex)((current + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
    } else if (isMention) pickMention(mentionMatches[mentionFocus]!);
    else pickCommand(slashMatches[slashFocus]!.command);
    return true;
  }
  return { onSelection: setSelection, onFocus: () => setFocused(true), onBlur: () => setFocused(false), onKeyDown,
    mentionMatches, mentionFocus, mentionQuery: mention?.query ?? "", pickMention, setMentionIndex,
    slashMatches, slashFocus, slashQuery: slash?.query ?? "", pickCommand, setSlashIndex,
    error: (mention || slash) && state?.status === "error" ? state.message : null };
}

export function CreateWorkspaceSuggestions({ state }: { state: ReturnType<typeof useCreateWorkspaceSuggestions> }) {
  return <>
    {state.mentionMatches.length > 0 && <FileMentionMenu matches={state.mentionMatches} focused={state.mentionFocus} hasQuery={state.mentionQuery !== ""} onPick={state.pickMention} onFocus={state.setMentionIndex} />}
    {state.slashMatches.length > 0 && <SlashMenu matches={state.slashMatches} focused={state.slashFocus} hasQuery={state.slashQuery !== ""} onPick={state.pickCommand} onFocus={state.setSlashIndex} />}
    {state.error && <div className="create-error" role="status">Couldn't load suggestions: {state.error}</div>}
  </>;
}
