import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port and must not clear its own terminal output.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "safari16",
    outDir: "dist",
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
