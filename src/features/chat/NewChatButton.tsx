// parity:chat.tabs:ui
// The "+" at the end of the chat tab strip (Conductor's `g8i` without
// terminal or browser tabs): a ghost icon button that opens a new chat in the
// workspace, with the tooltip "New chat, same files ⌘T" (the nav.newTab
// shortcut, as rebound) on hover and keyboard focus. At the tab limit it is
// disabled and the tooltip reads "Maximum 5 tabs allowed".
import { useKeybindingOverrides } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { atTabLimit, CHAT_TAB_LIMIT, NEW_CHAT_LABEL, newChatTooltip, tabLimitTooltip } from "./chatTabs.ts";

export function NewChatButton({ openTabs, onNewChat, limit = CHAT_TAB_LIMIT }: { openTabs: number; onNewChat: () => void; limit?: number }) {
  const { overrides } = useKeybindingOverrides();
  const key = effectiveShortcuts("nav.newTab", overrides)[0];
  const full = atTabLimit(openTabs, limit);
  return (
    <span className="main-tab-new">
      <button type="button" className="main-tab-new-button" aria-label={newChatTooltip(openTabs, key ? glyphs(key) : null, limit)} disabled={full} onClick={onNewChat}>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14M12 5v14" />
        </svg>
      </button>
      <span role="tooltip" aria-hidden="true" className="main-tab-tip">
        {full ? (
          tabLimitTooltip(limit)
        ) : (
          <>
            {NEW_CHAT_LABEL}
            {key && <kbd>{glyphs(key)}</kbd>}
          </>
        )}
      </span>
    </span>
  );
}
