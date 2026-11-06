import type { Dispatch } from "react";
import type { Action } from "../state/store";
import { CreateWorkspaceComposer, type CreateWorkspaceComposerProps } from "./CreateWorkspaceComposer";
import { SidebarIcon } from "./Icons";
import { effectiveShortcuts } from "../keybindings/overrides";
import { glyphs } from "../keybindings/shortcut";

const TOGGLE_LEFT_SIDEBAR_HINT = effectiveShortcuts("view.toggleLeftSidebar").map(glyphs).join(" or ");

type Props = Omit<CreateWorkspaceComposerProps, "eyebrowVariant" | "onBusyChange"> & {
  sidebarVisible: boolean;
  dispatch: Dispatch<Action>;
};

/**
 * The full-screen `/create` page (Conductor's `zCa`, shown instead of the
 * dialog when Settings › Experimental › New workspace page is on): a sidebar
 * toggle while the sidebar is hidden, and the composer centred in a
 * 768 px column with its eyebrow above the card.
 */
export function CreateWorkspacePage({ sidebarVisible, ...props }: Props) {
  return (
    <div className="create-page">
      <div className="create-page-top" data-tauri-drag-region>
        {!sidebarVisible && (
          <button
            type="button"
            className="home-sidebar-toggle create-page-toggle"
            title={`Toggle left sidebar (${TOGGLE_LEFT_SIDEBAR_HINT})`}
            aria-label="Toggle left sidebar"
            onClick={() => props.dispatch({ type: "toggleSidebar" })}
          >
            <SidebarIcon size={16} />
          </button>
        )}
      </div>
      <div className="create-page-scroll">
        <div className="create-page-column">
          <h1 className="sr-only">Create workspace</h1>
          <CreateWorkspaceComposer {...props} eyebrowVariant="floating" />
        </div>
      </div>
    </div>
  );
}
