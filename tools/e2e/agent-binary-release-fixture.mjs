import { createServer } from "node:http";

export function createAgentBinaryReleaseFixture(payload) {
  const fixture = {
    mode: "fail",
    requests: [],
    async holdFailuresUntil(ready) {
      return ready();
    },
  };
  fixture.server = createServer((req, res) => {
    const request = { path: req.url, mode: fixture.mode, status: null, finished: false };
    fixture.requests.push(request);
    res.on("finish", () => {
      request.status = res.statusCode;
      request.finished = true;
    });
    if (req.url !== "/claude" || request.mode === "fail") {
      res.writeHead(404).end("not here");
      return;
    }
    res.writeHead(200, { "content-length": payload.length, "content-type": "application/octet-stream" });
    let off = 0;
    const tick = () => {
      if (off >= payload.length) return void res.end();
      res.write(payload.subarray(off, off + 64 * 1024));
      off += 64 * 1024;
      setTimeout(tick, 60);
    };
    tick();
  });
  return fixture;
}
