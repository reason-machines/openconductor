export type LinkSelection = { kind: "workspace"; id: string } | { kind: "directory"; path: string };
export interface LinkMutation {
  workspaceId: string;
  kind: LinkSelection["kind"];
  value: string;
  linked: boolean;
}

export async function mutateWorkspaceLinks({ workspaceId, selection, linkedWorkspaceIds, mutate }: {
  workspaceId: string;
  selection: LinkSelection;
  linkedWorkspaceIds: readonly string[];
  mutate: (mutation: LinkMutation) => Promise<void>;
}): Promise<void> {
  await mutate(selection.kind === "workspace"
    ? { workspaceId, kind: "workspace", value: selection.id, linked: !linkedWorkspaceIds.includes(selection.id) }
    : { workspaceId, kind: "directory", value: selection.path, linked: true });
}
