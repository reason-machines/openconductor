import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Advanced uses the same executable-file rows as Agents, not its directory-only path row", () => {
  const advanced = read("./AdvancedPage.tsx");
  assert.match(advanced, /import \{ ExecutablePathRow \} from "\.\/rows\/AgentOptionRows";/);
  for (const agent of ["claude", "codex"]) {
    assert.match(advanced, new RegExp(`<ExecutablePathRow agent="${agent}" settings=\\{settings\\} save=\\{save\\} />`));
  }
  assert.doesNotMatch(advanced, /EXECUTABLES\.map/);
});

test("the root directory continues to use the folder picker", () => {
  const advanced = read("./AdvancedPage.tsx");
  assert.match(advanced, /<RootPathRow \/>/);
  assert.match(read("./RootPathRow.tsx"), /pickFolder\("Select OpenConductor root directory"\)/);
  assert.match(read("../backend.ts"), /open\(\{ directory: true, multiple: false, title, defaultPath \}\)/);
});
