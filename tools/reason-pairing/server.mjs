import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";

export const ACCOUNTS = [
  { id: "alex", name: "Alex Fixture", email: "alex@example.invalid" },
  { id: "sam", name: "Sam Fixture", email: "sam@example.invalid" },
];
export const WORKSPACES = [
  { id: "org-alpha", slug: "ws-alpha", name: "Fixture Alpha" },
  { id: "org-beta", slug: "ws-beta", name: "Fixture Beta" },
];

export async function startPairingServer({ ttlMs = 60_000, now = Date.now } = {}) {
  const clients = new Map();
  const pairings = new Map();
  const events = [];
  const completions = new EventEmitter();
  let origin;
  const client = (id) => {
    if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid fixture client");
    if (!clients.has(id)) clients.set(id, { account: null, pending: null });
    return clients.get(id);
  };
  const view = (pairing) => {
    if (pairing.state === "pending" && now() >= pairing.expiresAt) pairing.state = "expired";
    return { id: pairing.id, code: pairing.code, state: pairing.state, url: `${origin}/cli/connect?request=${pairing.id}`, selection: pairing.selection, workspaceHint: pairing.workspaceHint };
  };
  const status = (entry) => ({
    version: "0.2.692-fixture",
    account: entry.account && { name: entry.account.name, email: entry.account.email, credential: "login" },
    organization: entry.account && { name: WORKSPACES.find((w) => w.slug === entry.account.workspace)?.name },
    workspaces: entry.account ? WORKSPACES.map((w) => ({ ...w, selected: w.slug === entry.account.workspace })) : [],
    connection: { workspaces: [] },
  });
  const json = (response, code, value) => {
    response.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(value));
  };
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.authorization || request.headers.cookie) return json(response, 400, { error: "Real authentication is forbidden in this fixture" });
      const url = new URL(request.url, origin);
      if (url.pathname === "/cli/connect" && request.method === "GET") {
        const page = await readFile(new URL("./approval.html", import.meta.url));
        response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'" });
        return response.end(page);
      }
      if (url.pathname === "/fixture/options" && request.method === "GET") return json(response, 200, { accounts: ACCOUNTS, workspaces: WORKSPACES });
      let body = {};
      if (request.method === "POST") {
        let text = "";
        for await (const chunk of request) {
          text += chunk;
          if (text.length > 4096) return json(response, 413, { error: "Fixture request too large" });
        }
        body = text ? JSON.parse(text) : {};
      }
      const clientRoute = url.pathname.match(/^\/clients\/([a-zA-Z0-9-]+)\/(status|login|logout)$/);
      if (clientRoute) {
        const [, id, action] = clientRoute;
        const entry = client(id);
        events.push({ type: action, client: id });
        if (action === "status" && request.method === "GET") return json(response, 200, status(entry));
        if (action === "logout" && request.method === "POST") {
          entry.account = null;
          if (entry.pending && pairings.get(entry.pending).state === "pending") pairings.get(entry.pending).state = "cancelled";
          entry.pending = null;
          return json(response, 200, { ok: true });
        }
        if (action === "login" && request.method === "POST") {
          if (entry.account) return json(response, 200, { state: "connected", account: status(entry) });
          let pairing = pairings.get(entry.pending);
          if (!pairing || ["cancelled", "expired"].includes(view(pairing).state)) {
            const id = randomUUID();
            pairing = { id, client: clientRoute[1], code: `TEST-${String(pairings.size + 1).padStart(4, "0")}`, state: "pending", expiresAt: now() + ttlMs, workspaceHint: body.workspace ?? null, selection: null };
            pairings.set(id, pairing);
            entry.pending = id;
            events.push({ type: "created", client: pairing.client, pairing: id });
          }
          return json(response, 200, view(pairing));
        }
      }
      const pairingRoute = url.pathname.match(/^\/pairings\/([a-zA-Z0-9-]+)(?:\/(approve|cancel|poll))?$/);
      if (pairingRoute) {
        const [, id, action] = pairingRoute;
        const pairing = pairings.get(id);
        if (!pairing) return json(response, 404, { error: "Unknown fixture request" });
        const current = view(pairing);
        if (!action && request.method === "GET") return json(response, 200, current);
        if (action === "poll" && request.method === "POST") {
          events.push({ type: "poll", pairing: id, state: current.state });
          if (current.state === "approved") {
            const selected = ACCOUNTS.find((a) => a.id === pairing.selection.account);
            const entry = client(pairing.client);
            const firstCompletion = entry.account === null;
            entry.account = { ...selected, workspace: pairing.selection.workspace };
            if (firstCompletion) completions.emit("completed", pairing.client);
            return json(response, 200, { state: "connected", account: status(entry) });
          }
          return json(response, 200, current);
        }
        if (["approve", "cancel"].includes(action) && request.method === "POST") {
          if (current.state !== "pending") return json(response, 409, { error: `Pairing is ${current.state}` });
          if (action === "approve") {
            if (!ACCOUNTS.some((a) => a.id === body.account) || !WORKSPACES.some((w) => w.slug === body.workspace)) return json(response, 400, { error: "Choose a fixture account and workspace" });
            pairing.selection = { account: body.account, workspace: body.workspace };
            pairing.state = "approved";
          } else pairing.state = "cancelled";
          events.push({ type: action, pairing: id, selection: pairing.selection });
          return json(response, 200, view(pairing));
        }
      }
      return json(response, 404, { error: "Unknown fixture route" });
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, events, pairings, completions, close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }) };
}
