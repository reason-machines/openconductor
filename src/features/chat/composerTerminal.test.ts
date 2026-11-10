import { test } from "node:test";
import assert from "node:assert/strict";
import { terminalOutputFiles, terminalOutputRequest } from "./composerTerminal.ts";
import { ComposerSession } from "./composerSession.ts";
import { writeComposerDraft } from "./composerDocument.ts";

function session(id: string) {
  return new ComposerSession(id, { load: async () => "", save: async () => true, clear: async () => {} });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

test("read-only auto request carries panel and center IDs without creating a terminal", () => {
  assert.deepEqual(terminalOutputRequest("workspace", { activeId: "panel-b", next: 4, tabs: [
    { id: "panel-a", title: "Terminal", status: "running" },
    { id: "center", title: "Terminal 2", status: "running", placement: "center" },
    { id: "panel-b", title: "Terminal 3", status: "exited", placement: "panel" },
  ] }), { workspaceId: "workspace", source: "auto", maxLines: 1000, panelTerminalIds: ["panel-a", "panel-b"], tabTerminalIds: ["center"], activeTerminalId: "panel-b", preferredTerminalId: null });
});

test("no-output and backend errors do not become files", () => {
  assert.throws(() => terminalOutputFiles({ source: "none", output: "", isRunning: false }), { message: "No terminal output available for this workspace" });
  assert.throws(() => terminalOutputFiles({ source: "none", output: "", isRunning: false, error: "read refused" }), { message: "read refused" });
});

test("IPC values are validated before attachment construction", () => {
  for (const value of [null, {}, { source: "remote", output: "x", isRunning: true }, { source: "terminal", output: 4, isRunning: true }, { source: "terminal", output: "x", isRunning: "yes" }, { error: { message: "bad" } }]) {
    assert.throws(() => terminalOutputFiles(value), { message: "Invalid terminal output response" });
  }
});

test("terminal, Run and Spotlight output become named text files with source and status", async () => {
  for (const [source, label] of [["terminal", "Terminal"], ["run_script", "Run script"], ["spotlight", "Spotlight"]]) {
    const files = terminalOutputFiles({ source, output: "\u001b[32m ok\u001b[0m\r\nnext\u0000 ", isRunning: true }, 123);
    assert.equal(files.length, 1);
    assert.equal(files[0]!.name, `terminal-output-${source}-123.txt`);
    assert.equal(await files[0]!.text(), `Source: ${label}\nStatus: running\n\nok\nnext`);
  }
  const files = terminalOutputFiles({ source: "terminal", output: "", isRunning: false }, 123);
  assert.equal(await files[0]!.text(), "Source: Terminal\nStatus: stopped\n\n", "empty output from an existing source is not source:none");
});

test("capture and staging block Send, stay with originating chat, preserve atoms, and never auto-send", async () => {
  const a = session("a"), b = session("b");
  await a.connect(); await b.connect();
  const draft = writeComposerDraft([{ kind: "file", path: "keep.md", label: "keep.md", directory: false }, { kind: "text", text: " keep\n tail" }]);
  a.setDraft(draft); b.setDraft("other chat");
  const captured = deferred<unknown>(), staged = deferred<void>();
  const writes: { path: string; text: string }[] = [];
  let sends = 0;
  const attaching = a.attach(async () => terminalOutputFiles(await captured.promise, 123), async (path, data) => {
    writes.push({ path, text: new TextDecoder().decode(data) });
    await staged.promise;
  });
  assert.equal(await a.send(async () => {}, () => sends++), false, "capture is pending");
  a.disconnect();
  captured.resolve({ source: "terminal", output: "hello", isRunning: false });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await a.connect();
  assert.equal(await a.send(async () => {}, () => sends++), false, "staging is pending");
  staged.resolve(); await attaching;
  assert.equal(sends, 0);
  assert.equal(writes.length, 1);
  assert.match(writes[0]!.path, /^\.context\/attachments\/[a-z0-9]{6}\/terminal-output-terminal-123\.txt$/);
  assert.equal(writes[0]!.text, "Source: Terminal\nStatus: stopped\n\nhello");
  assert.equal(a.snapshot().draft, draft);
  assert.equal(a.snapshot().attachments.length, 1);
  assert.equal(b.snapshot().draft, "other chat");
  assert.deepEqual(b.snapshot().attachments, []);
  assert.equal(await a.send(async () => {}, () => sends++), true, "only explicit Send delivers");
  assert.equal(sends, 1);
  a.disconnect(); b.disconnect();
});

test("empty output, capture rejection and staging rejection release pending-file admission", async () => {
  for (const failure of ["empty", "capture", "stage"]) {
    const a = session(failure); await a.connect(); a.setDraft("keep");
    let writes = 0;
    await a.attach(async () => {
      if (failure === "capture") throw new Error("read refused");
      return terminalOutputFiles({ source: failure === "empty" ? "none" : "terminal", output: "ok", isRunning: false }, 123);
    }, async () => { writes++; throw new Error("write refused"); });
    assert.equal(writes, failure === "stage" ? 1 : 0);
    assert.equal(a.snapshot().draft, "keep");
    assert.deepEqual(a.snapshot().attachments, []);
    assert.match(a.snapshot().error ?? "", failure === "empty" ? /No terminal output available for this workspace/ : failure === "capture" ? /read refused/ : /write refused/);
    assert.equal(await a.send(async () => {}, () => {}), true, "no stuck capture/staging admission");
    a.disconnect();
  }
});

test("busy Send rejects terminal capture before starting the read", async () => {
  const a = session("busy"); await a.connect(); a.setDraft("keep");
  a.setAttachments([{ name: ".context/attachments/abc123/old.txt", staged: ".context/attachments/abc123/old.txt", text: "old" }]);
  const copying = deferred<void>();
  const sending = a.send(() => copying.promise, () => {});
  await a.attach(async () => { assert.fail("read started during send"); });
  assert.match(a.snapshot().error ?? "", /Wait for this send to finish/);
  copying.resolve(); await sending; a.disconnect();
});
