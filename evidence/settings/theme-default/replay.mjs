import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const evidence = dirname(fileURLToPath(import.meta.url));
const root = resolve(evidence, "../../..");
const fixture = JSON.parse(readFileSync(join(evidence, "fixture.json"), "utf8"));
const source = process.env.THEME_DEFAULT_BASELINE === "1"
  ? join(evidence, "baseline/types.ts")
  : join(root, "src/settings/types.ts");
const { DEFAULT_SETTINGS } = await import(pathToFileURL(source).href);
const { withField } = await import(pathToFileURL(join(root, "src/settings/model.ts")).href);

test("Theme default: missing preference starts dark", () => {
  assert.equal(DEFAULT_SETTINGS.general.theme, fixture.freshTheme);
});

for (const mode of fixture.explicitThemes) {
  test(`Theme default: explicit ${mode} is retained`, () => {
    const next = withField(DEFAULT_SETTINGS, "general", "theme", mode);
    assert.equal(next.general.theme, mode);
    assert.equal(next.appearance, DEFAULT_SETTINGS.appearance);
  });
}

test("Theme default: selecting a mode does not mutate defaults", () => {
  const before = structuredClone(DEFAULT_SETTINGS);
  for (const mode of fixture.explicitThemes) withField(DEFAULT_SETTINGS, "general", "theme", mode);
  assert.deepEqual(DEFAULT_SETTINGS, before);
});
