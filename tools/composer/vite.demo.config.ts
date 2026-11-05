// Builds tools/composer/demo.html (verifier harness) into $DEMO_OUT (default /tmp/oc-composer-demo).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  base: "./",
  publicDir: path.resolve(__dirname, "../../public"),
  plugins: [react()],
  build: { outDir: process.env.DEMO_OUT ?? "/tmp/oc-composer-demo", emptyOutDir: true, rollupOptions: { input: path.resolve(__dirname, "demo.html") } },
});
