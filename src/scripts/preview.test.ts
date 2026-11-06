import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLocalhostUrl, localhostInfo, previewEnvFrom, previewOptions, resolvePreviewUrl, type PreviewEnv } from "./preview.ts";

const ENV: PreviewEnv = {
  CONDUCTOR_WORKSPACE_NAME: "amber-falcon",
  CONDUCTOR_WORKSPACE_PATH: "/w/amber-falcon",
  CONDUCTOR_ROOT_PATH: "/r/app",
  CONDUCTOR_DEFAULT_BRANCH: "main",
  CONDUCTOR_PORT: "55000",
  CONDUCTOR_IS_LOCAL: "1",
};

test("detectLocalhostUrl takes the last localhost URL, after stripping ANSI", () => {
  const out = "\u001b[32m  ➜  Local:\u001b[39m   http://localhost:5173/\n  ➜  Network: http://192.168.1.4:5173/\nready at http://127.0.0.1:3000/app).\n";
  assert.equal(detectLocalhostUrl(out), "http://127.0.0.1:3000/app");
  assert.equal(detectLocalhostUrl("listening on http://0.0.0.0:8080"), "http://localhost:8080/");
  assert.equal(detectLocalhostUrl("on http://[::1]:4000/x"), "http://localhost:4000/x");
  assert.equal(detectLocalhostUrl("see https://example.com:443/"), null);
  assert.equal(detectLocalhostUrl(""), null);
});

test("detectLocalhostUrl only reads the last 1000 lines", () => {
  const old = "http://localhost:1111/\n" + "noise\n".repeat(1000);
  assert.equal(detectLocalhostUrl(old), null);
  assert.equal(detectLocalhostUrl(old + "http://localhost:2222/"), "http://localhost:2222/");
});

test("localhostInfo: port as written or the protocol default; other hosts are not local", () => {
  assert.deepEqual(localhostInfo("http://localhost:55000/"), { url: "http://localhost:55000/", port: 55000, displayPort: "55000" });
  assert.deepEqual(localhostInfo("https://127.0.0.1/"), { url: "https://127.0.0.1/", port: 443, displayPort: "443" });
  assert.equal(localhostInfo("http://example.com:3000/"), undefined);
  assert.equal(localhostInfo("ftp://localhost/"), undefined);
  assert.equal(localhostInfo("not a url"), undefined);
});

test("resolvePreviewUrl expands $((CONDUCTOR_PORT + N)) and $NAME like Conductor's gEi", () => {
  assert.equal(resolvePreviewUrl("http://localhost:$CONDUCTOR_PORT", ENV), "http://localhost:55000");
  assert.equal(resolvePreviewUrl("http://localhost:$(( CONDUCTOR_PORT + 2 ))/$CONDUCTOR_WORKSPACE_NAME", ENV), "http://localhost:55002/amber-falcon");
  // Only one digit and only the $NAME form, as in Conductor.
  assert.equal(resolvePreviewUrl("http://localhost:$((CONDUCTOR_PORT + 10))", ENV), "http://localhost:$((CONDUCTOR_PORT + 10))");
  assert.equal(resolvePreviewUrl("http://localhost:${CONDUCTOR_PORT}", ENV), "http://localhost:${CONDUCTOR_PORT}");
  assert.equal(resolvePreviewUrl("http://localhost:$CONDUCTOR_PORT", {}), "http://localhost:$CONDUCTOR_PORT");
});

test("previewOptions: configured URLs win over the detected one; labels fall back to the URL", () => {
  const configured = [
    { name: " Web ", url: "http://localhost:$CONDUCTOR_PORT" },
    { name: "", url: "   " },
    { name: null, url: "https://staging.example.com" },
  ];
  assert.deepEqual(previewOptions(configured, "http://localhost:9999/", ENV), [
    { rawUrl: "http://localhost:$CONDUCTOR_PORT", resolvedUrl: "http://localhost:55000", label: "Web", displayPort: "55000" },
    { rawUrl: "https://staging.example.com", resolvedUrl: "https://staging.example.com", label: "https://staging.example.com", displayPort: undefined },
  ]);
  assert.deepEqual(previewOptions([], "http://localhost:9999/", ENV), [
    { rawUrl: "http://localhost:9999/", resolvedUrl: "http://localhost:9999/", label: "http://localhost:9999/", displayPort: "9999" },
  ]);
  assert.deepEqual(previewOptions(null, null, ENV), []);
});

test("previewEnvFrom keeps only the preview variables", () => {
  assert.deepEqual(previewEnvFrom([["CONDUCTOR_PORT", "55000"], ["SECRET", "x"]]), { CONDUCTOR_PORT: "55000" });
});
