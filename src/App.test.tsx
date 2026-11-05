import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { getAppInfo } from "./lib/tauri";

describe("app shell", () => {
  it("renders the OpenConductor brand and sidebar", () => {
    const html = renderToString(<App />);
    expect(html).toContain("OpenConductor");
    expect(html).toContain('aria-label="Workspaces"');
  });

  it("falls back to browser app info outside Tauri", async () => {
    await expect(getAppInfo()).resolves.toEqual({ name: "OpenConductor", version: "dev (browser)" });
  });
});
