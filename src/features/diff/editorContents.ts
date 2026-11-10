// parity:diff.edit-in-viewer:ui parity:diff.edit-in-viewer:command
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
