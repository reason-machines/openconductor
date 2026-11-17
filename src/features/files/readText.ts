export type TextRead =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; text: string };

export function readText(read: () => Promise<string>, publish: (state: TextRead) => void): () => void {
  let live = true;
  publish({ kind: "loading" });
  void Promise.resolve().then(read).then(
    (text) => { if (live) publish({ kind: "ready", text }); },
    (error: unknown) => { if (live) publish({ kind: "error", message: String(error) }); },
  );
  return () => { live = false; };
}
