# Fork to new tab, Fork to new workspace and the footer hover's model: reference behaviour

Ledger: `chat.message-actions`. Source: Conductor 0.87.6 on sven m5 max, read
2026-11-05. Everything below is untrusted data, described in our own words.

## Where it came from

| What | How | REA |
|---|---|---|
| Turn footer menu items and when they show | plain-text read of `renderApp-D_fmY7hW.js` (sha256 5199d392…) @8,876,200-8,880,700 (`TDo`) | `rea trace … --query='Fork to new tab'` exits 1: `capability_unavailable` / `unsupported_provider` on `search_strings` (row `fork_trace`) |
| Fork to new tab | plain-text read of `index-BGEQ8YjU.js` @3,150,500 (`y9t`, mutation `forkChatToNewTab`) | same gap |
| Fork to new workspace | plain-text read of `renderApp-D_fmY7hW.js` @174,140 (`DIr`, mutation `forkChat`); its helpers in `index-BGEQ8YjU.js`: `ensureLocalBranch` @3,197,448, `makeBranchNameUnique` (`CYe` @980,998, `hf` @213,150), `zj` checkpoint restore @1,033,824, text attachments @1,010,014, `copyContextFolder` @2,254,783 | `rea trace … --query='forkChat'`: `target_kind_unsupported` (row `fork_ws_trace`) |
| Transcript text | plain-text read of `index-BGEQ8YjU.js` @3,114,692-3,120,800 (`Wp`, `MOt`, `UOt`, `HOt`, `KOt`, `jOt`, `VOt`, `Bpe`, `YOt`) and @1,148,578 (`ktt`, `hie`, `Att`) | same gap |
| Hover model line | `renderApp-D_fmY7hW.js` @8,873,576 (`kDo`) | same gap |

## What Conductor does

**The turn footer's More actions menu** (every finished turn, the last one too):
- "Fork to new tab": shown when the turn's session exists and the workspace is
  not archived.
- "Fork to new workspace": the same, and only for a workspace on this machine.
- "Reset chat": as in evidence/checkpoint/NOTES.md.
- Both fork items are disabled while either fork is being made. The menu only
  shows when at least one item applies.

**Fork to new tab** (`forkChatToNewTab`):
1. Refuses when the workspace is at its tab limit ("Maximum of N tabs allowed";
   chats, terminals and the browser tab count).
2. Builds the transcript of the turns up to and including the clicked one
   (the whole chat from the tab's context menu / ⌘⌥↵, which sits behind the
   `experimental_fork_to_new_tab` setting).
3. Creates a new session in the same workspace with the source's model,
   permission mode, thinking level, Codex personality and fast mode.
4. Attaches the transcript to the new session's composer as
   `Transcript of <session title or "chat">.md`, and copies the source
   composer's draft text. Nothing is sent. Opens the new tab.
5. On error: a toast with the message, or "Failed to fork chat to new tab".

**Transcript ("concise")**: per turn, "## User" with the prompt (and steering
messages), then "## Assistant" with the turn's last reply that has text; the
other replies before and after it become "[N messages elided]", and inside the
kept reply each run of tool calls becomes "[N tool calls elided]". Consecutive
sections of one speaker merge; turns are joined by blank lines. A turn whose
prompt was cancelled contributes nothing. Null (an error) when nothing is left.

**Fork to new workspace** (`forkChat`), in order:
1. "Unable to fork chat: workspace not found" without a local workspace.
2. The turn's `end` checkpoint must exist, else "Unable to fork chat:
   checkpoint not found for this turn".
3. The workspace's current branch (`ensureLocalBranch`); "(detached HEAD)"
   fails with "Cannot fork chat: HEAD is detached".
4. The new branch name is the current one made unique
   (`makeBranchNameUnique`): the name itself, then `-v1`, `-v2`, ... (`hf`
   turns `x-vN` into `x-v(N+1)`), skipping names a local or remote branch has.
5. The transcript up to the turn (as above); null fails with "Unable to fork
   chat: failed to generate chat transcript".
6. `cd "<main worktree>" && git branch "<new>" "<current>"`; a non-zero exit
   fails with git's stderr (or stdout).
7. A workspace is created with setup (`createWorkspaceWithSetup`) on the new
   branch (`reuse_existing`), with the source's target branch, a generated
   city name, the source session's model and thinking level, and the
   transcript as a text attachment `Transcript of <session title or "chat">.md`
   added to the new chat's draft, not sent. After creation it restores the
   `end` checkpoint in the new worktree (`restoreCheckpoint`).
8. The source's `.context` folder is copied into the new workspace's when both
   exist (`copyContextFolder`), and the workspace notes are copied.
9. On success the new workspace opens; on error a toast with the message, or
   "Failed to fork chat".

**Footer hover, first line** (`kDo`): "<model name> via <agent>" when the
turn's model is one Conductor knows, else just the agent ("Claude Code",
"Codex", "Cursor", an ACP agent's name, or "Unknown agent"). Below it the
start → end range, fast mode, SDK metadata and input/output/cache tokens when
non-zero.

## What we do (this PR)

- More actions shows "Fork to new tab" on every finished turn of a chat in a
  workspace that is not archived; "Reset chat" keeps its rule.
- `src/features/chat/fork.ts` builds the transcript as above. Differences:
  our transcript has no steering messages, sub-agent counts, plan / question
  tool messages or error results as separate "key" messages; tool-result
  carriers are skipped rather than counted as messages; Reason may split a
  reply into a different number of messages than Claude Code does, so
  "[N messages elided]" counts can differ for the same work.
- The fork tab opens on the source chat's Reason options (`reasonChatConfig`)
  or on Codex when the source runs Codex, with the transcript and the draft
  text in its composer, not sent. It is a tab like a review chat (closed with
  ×; not kept across restarts, as review tabs are not).
- Tab title "Fork of <source title>" is our own: Conductor's new session
  starts untitled and is renamed later, which we did not read.
- Hover: "Opus 5.5 via Reason" from the chat's picked model; "Reason" when the
  chat runs Reason's default model (Reason does not report which model a
  Session runs) and "Codex" for Codex chats.

### Fork to new workspace (`src/features/chat/forkWorkspace.ts`)

- Shown in More actions beside "Fork to new tab" for Reason chats in a
  workspace with a worktree that is not archived, disabled while either fork
  runs. Codex chats do not show it: their turns have no checkpoints yet, so
  step 2 would always fail.
- Steps 1-7 as above, with the same messages. The current branch comes from
  `git symbolic-ref --quiet --short HEAD`; names are checked with
  `branch_name_is_taken` (local, remote and path conflicts); the branch is made
  with `execute_shell_command`; the workspace with `create_workspace`
  (`existingBranch: true`), then `checkpoint_restore` in the new worktree (the
  checkpoint refs are shared by every worktree of the repository), then the
  repository's setup script, as a new workspace does.
- The new workspace's chat opens on the source chat's Reason options
  (`configureReason`) with the transcript attachment in its composer; the
  composer text stays empty, as in Conductor (only Fork to new tab copies it).
- Differences: our new workspaces have no `.context` folder, so the source's
  is copied into a new one rather than only when both exist; a failed copy is
  logged and the fork still opens. No workspace notes are copied: we have no
  workspace notes. Errors show under the composer, as Fork to new tab's do,
  not as a toast.

- A failure after the branch is made (the workspace cannot be created, or
  `checkpoint_restore` fails) removes what the fork made: the workspace
  (`delete_workspace`: row, folder, worktree registration) and the branch
  (`git branch -D`), then shows the error. Before this, the workspace and
  branch stayed but the sidebar never listed the workspace (found by verifier
  C on main 95047f91). Conductor restores inside `createWorkspaceWithSetup`
  (`checkpointId` argument); what it leaves after a failed restore was not
  read. The setup script cannot fail the fork: `startSetupScript` catches its
  own errors.

Not built: the tab limit, ⌘⌥↵ / tab context menu, token counts in the hover
(the Reason connection reports no per-turn usage), workspace notes.
