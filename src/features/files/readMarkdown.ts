export type MarkdownRead =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; text: string };

export function readMarkdown(read: () => Promise<string>, publish: (state: MarkdownRead) => void): () => void {
  let live = true;
  publish({ kind: "loading" });
  void Promise.resolve().then(read).then(
    (text) => { if (live) publish({ kind: "ready", text }); },
    (error: unknown) => { if (live) publish({ kind: "error", message: String(error) }); },
  );
  return () => { live = false; };
}
