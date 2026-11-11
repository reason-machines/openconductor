import { preview } from "vite";
import { spawn } from "node:child_process";

const port = Number(process.env.CLOUD_UI_PORT ?? 4387);
await preview({ preview: { host: "0.0.0.0", port, strictPort: true } });
const tests = spawn(process.execPath, ["--test", "tests/e2e/cloud-ui.e2e.mjs"], {
  stdio: "inherit",
  env: { ...process.env, CLOUD_UI_BASE_URL: `http://127.0.0.1:${port}` },
});
tests.on("exit", (code) => {
  console.log(`Cloud UI browser checks ${code === 0 ? "PASSED" : "FAILED"}. Preview remains available on port ${port}.`);
});
