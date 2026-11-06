// Real-agent check of the "/" menu wire protocol, as OpenConductor's
// slash_commands.rs and chat runners send it. Writes results.json in this folder.
// claude: initialize lists the fixture skill; "/oc-fixture ARGS" runs it in a turn.
// codex:  skills/list lists the fixture; turn/start with a {type:"skill"} item runs it.
// reason: `reason skills list` lists skills; "/bro ARGS" runs one in an ACP turn.
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const dir = __dirname;
const work = path.join(dir, "work");
const MARKER = "OC-FIXTURE-SKILL-RAN";
const results = {};
const save = () => fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(results, null, 2));
const which = (n) => execFileSync("/bin/zsh", ["-lc", `whence -p ${n}`]).toString().trim();

function setup() {
  fs.rmSync(work, { recursive: true, force: true });
  const skill = `---\nname: oc-fixture\ndescription: OpenConductor e2e fixture skill\n---\n\nWhen this skill runs, reply with exactly one line: ${MARKER} followed by a space and the user's arguments. Do nothing else.\n`;
  for (const d of [".claude/skills/oc-fixture", ".agents/skills/oc-fixture"]) {
    fs.mkdirSync(path.join(work, d), { recursive: true });
    fs.writeFileSync(path.join(work, d, "SKILL.md"), skill);
  }
  execFileSync("git", ["init", "-q"], { cwd: work });
}

function lines(child, onLine) {
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        onLine(JSON.parse(l));
      } catch {}
    }
  });
}

function claude() {
  return new Promise((resolve) => {
    const r = (results.claude = { started: new Date().toISOString() });
    const exe = which("claude");
    const child = spawn(exe, ["--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"], { cwd: work });
    const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
    const done = (k, v) => {
      r[k] = v;
      save();
      if (k === "error" || k === "turn") {
        child.kill();
        resolve();
      }
    };
    lines(child, (m) => {
      if (m.type === "control_response" && m.response?.request_id === "oc_slash_init") {
        const cmds = m.response.response?.commands ?? [];
        r.commandCount = cmds.length;
        r.fixture = cmds.find((c) => c.name === "oc-fixture") ?? null;
        r.sample = cmds.slice(0, 5).map((c) => c.name);
        save();
        send({ type: "user", message: { role: "user", content: [{ type: "text", text: "/oc-fixture claude-real" }] }, parent_tool_use_id: null });
      } else if (m.type === "result") done("turn", { subtype: m.subtype, is_error: m.is_error, result: m.result, ran: String(m.result).includes(MARKER) });
    });
    child.stderr.on("data", (d) => (r.stderr = (r.stderr ?? "") + String(d).slice(0, 400)));
    send({ type: "control_request", request_id: "oc_slash_init", request: { subtype: "initialize" } });
    setTimeout(() => done("error", "timeout"), 240000);
  });
}

function codex() {
  return new Promise((resolve) => {
    const r = (results.codex = { started: new Date().toISOString() });
    const child = spawn(which("codex"), ["app-server", "--listen", "stdio://"], { cwd: work });
    let id = 0;
    const pending = new Map();
    const call = (method, params) =>
      new Promise((res) => {
        id += 1;
        pending.set(id, res);
        child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
      });
    let text = "";
    let turnDone;
    const turnEnded = new Promise((res) => (turnDone = res));
    lines(child, (m) => {
      if (m.id !== undefined && pending.has(m.id) && !m.method) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      } else if (m.method === "item/agentMessage/delta") text += m.params?.delta ?? "";
      else if (m.method === "item/completed" && m.params?.item?.type === "agentMessage") text = m.params.item.text ?? text;
      else if (m.method === "turn/completed") turnDone(m.params?.turn?.status);
      else if (m.id !== undefined && m.method) child.stdin.write(JSON.stringify({ id: m.id, result: { decision: "accept" } }) + "\n");
    });
    const finish = (k, v) => {
      r[k] = v;
      save();
      child.kill();
      resolve();
    };
    setTimeout(() => finish("error", "timeout"), 240000);
    (async () => {
      await call("initialize", { clientInfo: { name: "openconductor", version: "0.1.0" } });
      child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
      const list = await call("skills/list", { cwds: [work] });
      const entry = (list.result?.data ?? [])[0];
      const skills = (entry?.skills ?? []).filter((s) => s.enabled);
      r.skillCount = skills.length;
      r.fixture = skills.find((s) => s.name === "oc-fixture") ?? null;
      r.sample = skills.slice(0, 6).map((s) => `${s.name} (${s.scope})`);
      save();
      if (!r.fixture) return finish("error", "no fixture skill");
      const th = await call("thread/start", { cwd: work, approvalPolicy: "never", sandbox: "read-only" });
      const threadId = th.result?.thread?.id;
      await call("turn/start", { threadId, input: [{ type: "text", text: "$oc-fixture codex-real" }, { type: "skill", name: "oc-fixture", path: r.fixture.path }] });
      const status = await turnEnded;
      finish("turn", { status, text, ran: text.includes(MARKER) });
    })().catch((e) => finish("error", String(e)));
  });
}

function reason() {
  return new Promise((resolve) => {
    const r = (results.reason = { started: new Date().toISOString() });
    const exe = which("reason");
    try {
      const out = JSON.parse(execFileSync(exe, ["skills", "list", "--input-file", "-"], { cwd: work, input: "{}\n" }).toString());
      const items = (out.data?.items ?? []).filter((s) => s.is_enabled !== false);
      r.skillCount = items.length;
      r.bro = items.find((s) => s.name === "bro") ? { name: "bro", description: items.find((s) => s.name === "bro").description } : null;
      r.sample = items.slice(0, 6).map((s) => s.name);
    } catch (e) {
      r.listError = String(e).slice(0, 300);
    }
    save();
    const child = spawn(exe, ["acp", "-y"], { cwd: os.homedir() });
    let id = 0;
    const pending = new Map();
    const call = (method, params) =>
      new Promise((res) => {
        id += 1;
        pending.set(id, res);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    let text = "";
    lines(child, (m) => {
      if (m.id !== undefined && pending.has(m.id) && !m.method) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      } else if (m.method === "session/update" && m.params?.update?.sessionUpdate === "agent_message_chunk") text += m.params.update.content?.text ?? "";
      else if (m.method === "session/update" && m.params?.update?.sessionUpdate === "available_commands_update") r.availableCommands = (m.params.update.availableCommands ?? []).length;
    });
    const finish = (k, v) => {
      r[k] = v;
      save();
      child.kill();
      resolve();
    };
    setTimeout(() => finish("error", `timeout; text so far: ${text.slice(0, 300)}`), 420000);
    (async () => {
      await call("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
      const s = await call("session/new", { cwd: work, mcpServers: [] });
      r.sessionId = s.result?.sessionId;
      const p = await call("session/prompt", { sessionId: r.sessionId, prompt: [{ type: "text", text: "/bro The deploy failed because the TLS certificate expired on Sunday." }] });
      finish("turn", { stopReason: p.result?.stopReason, error: p.error?.message, text: text.slice(0, 1200) });
    })().catch((e) => finish("error", String(e)));
  });
}

(async () => {
  setup();
  const only = process.argv[2];
  if (!only || only === "claude") await claude();
  if (!only || only === "codex") await codex();
  if (!only || only === "reason") await reason();
  results.done = new Date().toISOString();
  save();
})();
