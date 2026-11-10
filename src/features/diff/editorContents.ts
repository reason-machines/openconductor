// parity:diff.edit-in-viewer:ui parity:diff.edit-in-viewer:command
export interface EditorDraftState {
  readonly contents: Map<string, string>;
  readonly pendingSaves: Map<string, number>;
}

export function changeEditorDraft(state: EditorDraftState, key: string, savedText: string | null, contents: string): void {
  if (state.pendingSaves.has(key) || contents !== savedText) state.contents.set(key, contents);
  else state.contents.delete(key);
}

export async function persistEditorDraft(state: EditorDraftState, key: string, contents: string, write: () => Promise<void>): Promise<void> {
  state.pendingSaves.set(key, (state.pendingSaves.get(key) ?? 0) + 1);
  try {
    await write();
    if (state.contents.get(key) === contents) state.contents.delete(key);
  } finally {
    const pending = state.pendingSaves.get(key) ?? 0;
    if (pending > 1) state.pendingSaves.set(key, pending - 1);
    else state.pendingSaves.delete(key);
  }
}

export interface EditorContents {
  readonly key: string;
  readonly onDisk: string | null;
  readonly generation: number;
  readonly saved: string | null;
}

export function observeEditorContents(previous: EditorContents, key: string, onDisk: string | null, drafts: ReadonlyMap<string, string>): EditorContents {
  if (previous.key !== key) return { key, onDisk, generation: previous.generation + 1, saved: null };
  if (onDisk === null || previous.onDisk === onDisk) return previous;

  let generation = previous.generation;
  if (previous.saved !== onDisk && previous.onDisk !== null && !drafts.has(key)) generation += 1;
  return { ...previous, onDisk, generation, saved: null };
}

export function acknowledgeEditorSave(previous: EditorContents, key: string, contents: string): EditorContents {
  return previous.key === key ? { ...previous, saved: contents } : previous;
}
