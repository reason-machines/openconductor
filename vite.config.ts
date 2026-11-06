import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// File and folder icons (src/components/fileIcons.ts): serve the MIT
// vscode-material-icons SVGs at /material-icons/<name>.svg, the path Conductor
// uses, in dev and in the build, without copying 910 files into the repo.
function materialIcons(): Plugin {
  const dir = path.resolve(__dirname, "node_modules/vscode-material-icons/generated/icons");
  return {
    name: "oc-material-icons",
    configureServer(server) {
      server.middlewares.use("/material-icons", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\//, "");
        if (!/^[\w.-]+\.svg$/.test(name)) return next();
        const file = path.join(dir, name);
        if (!fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "max-age=3600");
        res.end(fs.readFileSync(file));
      });
    },
    generateBundle() {
      for (const name of fs.readdirSync(dir)) {
        if (name.endsWith(".svg")) this.emitFile({ type: "asset", fileName: `material-icons/${name}`, source: fs.readFileSync(path.join(dir, name)) });
      }
    },
  };
}

// Tauri expects a fixed dev port and does not want Vite to clear its output.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), materialIcons()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  // Pierre's highlighter worker splits into chunks, so it ships as a module worker (as in Conductor).
  worker: { format: "es" },
  build: {
    target: "safari15",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
