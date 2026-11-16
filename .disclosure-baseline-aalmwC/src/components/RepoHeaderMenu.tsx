import { Menu } from "@base-ui/react/menu";
import { ArrowUpRightIcon, SettingsIcon } from "./menu/menuIcons";
import type { Repo } from "../state/types";
import { openUrl } from "../backend";
import { openRepoSettingsPage } from "../features/chat/ChatModelPicker";
import { repositoryGitHubUrl } from "../workspace/repositoryGitHubUrl";
import { RepoIcon } from "./RepoIcon";
import "./sidebarActionsMenu.css";
import "./repoHeaderMenu.css";

export function RepoHeaderMenu({ repo, onError }: { repo: Repo; onError?: (message: string) => void }) {
  const githubUrl = repositoryGitHubUrl(repo.remote);
  return (
    <Menu.Root>
      <Menu.Trigger className="ws-repo-trigger">
        <RepoIcon repo={repo} />
        <span>{repo.name}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="sb-actions-positioner" side="bottom" align="start" sideOffset={4} collisionPadding={5}>
          <Menu.Popup className="sb-actions-popup" aria-label="Repository actions">
            <Menu.Item className="sb-actions-item" onClick={() => openRepoSettingsPage(repo.id, "misc")}>
              <SettingsIcon />
              <span>Repository settings</span>
            </Menu.Item>
            {githubUrl && (
              <Menu.Item className="sb-actions-item" onClick={() => void openUrl(githubUrl).catch((error: unknown) => onError?.(error instanceof Error ? error.message : String(error)))}>
                <ArrowUpRightIcon />
                <span>Open on GitHub</span>
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
