import { createServer as createHttpServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createViteServer } from "vite";

export async function startViteFixture({
  host = process.env.TEST_VITE_HOST ?? "127.0.0.1",
  port = Number(process.env.TEST_VITE_PORT ?? 0),
  diagnostic,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError("Fixture port must be an integer from 0 to 65535");
  }
  const browserHost = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  const http = createHttpServer();
  const cacheDir = await mkdtemp(join(tmpdir(), "openconductor-vite-fixture-"));
  let vite;
  let closing;
  const close = () => {
    diagnostic?.(`close requested ${cacheDir}: ${JSON.stringify({
      listening: http.listening,
      hmrClients: vite?.ws.clients.size ?? 0,
      pendingRequests: vite ? [...vite._pendingRequests.keys()] : [],
    })}`);
    return closing ??= (async () => {
      const stopped = new Promise((resolve, reject) => {
        diagnostic?.(`HTTP close ${cacheDir}: started`);
        http.close((error) => {
          diagnostic?.(`HTTP close ${cacheDir}: ${error?.code ?? "completed"}`);
          if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
          else resolve();
        });
        http.closeAllConnections();
      });
      const results = await Promise.allSettled([stopped, (async () => {
        // Vite 5 can strand cold optimizer loads when close cancels their crawl.
        diagnostic?.(`pending transforms ${cacheDir}: started`);
        while (vite?._pendingRequests.size) {
          await Promise.allSettled([...vite._pendingRequests.values()].map((pending) => pending.request));
        }
        diagnostic?.(`pending transforms ${cacheDir}: completed`);
        diagnostic?.(`Vite close ${cacheDir}: started`);
        await vite?.close();
        diagnostic?.(`Vite close ${cacheDir}: completed`);
        diagnostic?.(`cache removal ${cacheDir}: started`);
        await rm(cacheDir, { recursive: true, force: true });
        diagnostic?.(`cache removal ${cacheDir}: completed`);
      })()]);
      const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
      if (errors.length) throw new AggregateError(errors, "Failed to close Vite fixture");
    })();
  };

  try {
    // Vite 5 maps its own port: 0 to 5173. Keep the OS-allocated listener instead.
    vite = await createViteServer({
      appType: "spa",
      cacheDir,
      server: {
        host, port, strictPort: true, middlewareMode: true,
        // Concrete zero overrides clear inherited Tauri HMR ports during config merge.
        hmr: { server: http, host: browserHost, protocol: "ws", port: 0, clientPort: 0 },
      },
      logLevel: "error",
    });
    http.on("request", vite.middlewares);
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        http.off("error", failed);
        http.off("listening", ready);
      };
      const failed = (error) => { cleanup(); reject(error); };
      const ready = () => { cleanup(); resolve(); };
      http.once("error", failed);
      http.once("listening", ready);
      try { http.listen({ host, port }); } catch (error) { failed(error); }
    });
    const address = http.address();
    if (!address || typeof address === "string") throw new Error("Fixture has no TCP address");
    const hostname = browserHost.includes(":") ? `[${browserHost}]` : browserHost;
    return { base: `http://${hostname}:${address.port}`, close };
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Vite fixture startup and cleanup failed");
    }
    throw error;
  }
}
