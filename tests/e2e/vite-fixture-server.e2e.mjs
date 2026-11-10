import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { startViteFixture } from "./vite-fixture-server.mjs";

async function reserve(port, host = "127.0.0.1") {
  const server = createServer();
  const listening = once(server, "listening");
  server.listen({ port, host });
  await listening;
  return server;
}

function release(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("fixture ports must be valid before allocating resources", async () => {
  for (const port of [-1, 65536, 1.5, NaN]) {
    await assert.rejects(startViteFixture({ port }), RangeError);
  }
});

test("concurrent Vite fixtures own ephemeral HTTP and same-origin HMR listeners", { timeout: 60_000 }, async (t) => {
  const held = [];
  const fixtures = [];
  const sockets = [];
  const previousHost = process.env.TAURI_DEV_HOST;
  t.after(async () => {
    if (previousHost === undefined) delete process.env.TAURI_DEV_HOST;
    else process.env.TAURI_DEV_HOST = previousHost;
    sockets.forEach((socket) => socket.close());
    const results = await Promise.allSettled([
      ...fixtures.map((fixture) => fixture.close()),
      ...held.filter((server) => server.listening).map(release),
    ]);
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, "Listener regression cleanup failed");
  });

  // Neither Vite's default HTTP port nor either default/inherited HMR port is available.
  for (const port of [5173, 24678, 1421]) held.push(await reserve(port));
  process.env.TAURI_DEV_HOST = "192.0.2.1";
  const started = await Promise.allSettled(
    ["127.0.0.1", "0.0.0.0"].map(async (host) => {
      const fixture = await startViteFixture({ host, port: 0 });
      fixtures.push(fixture);
      return fixture;
    }),
  );
  for (const result of started) {
    if (result.status === "rejected") throw result.reason;
  }
  const ports = fixtures.map((fixture) => Number(new URL(fixture.base).port));
  assert.equal(new Set(ports).size, 2);
  assert.ok(ports.every((port) => port > 0 && ![5173, 24678, 1421].includes(port)));

  for (const fixture of fixtures) {
    assert.equal(new URL(fixture.base).hostname, "127.0.0.1");
    const html = await fetch(fixture.base + "/tools/dialogs/index.html");
    assert.equal(html.status, 200);
    assert.match(await html.text(), /src="\/@vite\/client"/);
    const source = await fetch(fixture.base + "/tools/dialogs/fixture.tsx");
    assert.equal(source.status, 200);
    const transformed = await source.text();
    assert.match(transformed, /\/@react-refresh/);
    assert.match(transformed, /jsxDEV|jsxRuntime|createElement/);
    const client = await (await fetch(fixture.base + "/@vite/client")).text();
    assert.match(client, /const hmrPort = null/);
    assert.match(client, /const socketHost =.*127\.0\.0\.1/);

    const socket = new WebSocket(fixture.base.replace("http:", "ws:") + "/", "vite-hmr");
    sockets.push(socket);
    const connected = new Promise((resolve, reject) => {
      socket.addEventListener("message", (event) => resolve(JSON.parse(event.data)), { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    assert.deepEqual(await connected, { type: "connected" });
  }

  // Explicit ports remain strict, and a failed bind must not disturb a live fixture.
  await assert.rejects(startViteFixture({ host: "127.0.0.1", port: ports[0] }), { code: "EADDRINUSE" });
  assert.equal((await fetch(fixtures[0].base + "/tools/dialogs/index.html")).status, 200);
  const socketClosed = sockets.map((socket) => once(socket, "close"));
  await Promise.all(fixtures.flatMap((fixture) => [fixture.close(), fixture.close()]));
  await Promise.all(socketClosed);
  for (const port of ports) {
    const rebound = await reserve(port);
    held.push(rebound);
    await release(rebound);
  }

  const previousTestHost = process.env.TEST_VITE_HOST;
  const previousTestPort = process.env.TEST_VITE_PORT;
  try {
    process.env.TEST_VITE_HOST = "127.0.0.1";
    process.env.TEST_VITE_PORT = String(ports[0]);
    const overridden = await startViteFixture();
    fixtures.push(overridden);
    assert.equal(overridden.base, `http://127.0.0.1:${ports[0]}`);
    await assert.rejects(startViteFixture(), { code: "EADDRINUSE" });
  } finally {
    if (previousTestHost === undefined) delete process.env.TEST_VITE_HOST;
    else process.env.TEST_VITE_HOST = previousTestHost;
    if (previousTestPort === undefined) delete process.env.TEST_VITE_PORT;
    else process.env.TEST_VITE_PORT = previousTestPort;
  }
});
